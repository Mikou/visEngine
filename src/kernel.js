var Kernel = {};

var getSchema = function (template) {
  return new Promise(function (resolve, reject) {
    
    var xhr = new XMLHttpRequest();
    var headers = {
      'Accept': 'text/html,application/xml,application/json;odata.metadata=full',
      'Odata-Version': '4.0',
      'Odata-MaxVersion': '4.0',
      'Prefer': 'odata.allow-entityreferences'
    };

    var request = {
      headers:headers,
      requestUri: template.Database + "$metadata",
      data: null
    };

    var successCallback = function (response) {
      resolve(response.dataServices.schema[0]);
    }

    var errorCallback = function (err) {
      reject(err);
    }

    odatajs.oData.read(request, successCallback, errorCallback, odatajs.oData.metadataHandler);
  });
}


var getEntity = function (template, schema) {
  var namespace = schema.namespace;
  var entitySet = schema.entityContainer.entitySet;

  function convertType (type) {
    switch(type) {
      case "Edm.Int32":
        return "Number";
      case "Edm.String":
        return "String";
      default:
        return "undefined";
    }
  }

  function getEntityType (name) {
    for(var i in schema.entityType) {
      var fullyQualifiedName = namespace + "." + schema.entityType[i].name;
      if(fullyQualifiedName === name) return schema.entityType[i];
    } throw new Error("entityType " + fullyQualifiedName + " not found in the schema");
  }

  function getEntitySet (name) {
    var entityContainer = schema.entityContainer;
    for(var i in entityContainer.entitySet) {
      var entitySet = entityContainer.entitySet[i];
      if(name === entitySet.name) return entitySet;
    } throw new Error("entitySet " + name + " not found in the schema");
  }

  var entitySet = getEntitySet(template.Table);
  var entity = {
    type: 'entity',
    name: template.Table,
    candidate: false,
    properties: {}
  };
  var entityType = getEntityType(entitySet.entityType);
  var pKey = entityType.key[0].propertyRef[0].name;
  for(var i in entityType.property) {
    var property = entityType.property[i];
    entity.properties[property.name] = {
      type: 'entityProp', 
      isPkey: (pKey === property.name),
      candidate: false,
      propType: convertType(property.type)
    }
  }

  return entity;
};

var getVisComponent = function (componentName) {
  if(componentName === 'TextBox') {
    return {
      type:"TextBox",
      properties: {
        Top: {genericValue: 10, computedValue: undefined, getValue: function () {
          return (typeof this.computedValue === 'undefined') 
                  ? this.genericValue : this.computedValue;
        }},
        Left: {genericValue: 10, computedValue: undefined, getValue: function () {
          return (typeof this.computedValue === 'undefined') 
                  ? this.genericValue : this.computedValue;
        }},
        Text: {genericValue: 'My Empty TextBox', computedValue: undefined, getValue: function () {
          return (typeof this.computedValue === 'undefined') 
                  ? this.genericValue : this.computedValue;
        }}
      },
      toHTML: function () {
        console.log(this);
        return '<div id="" style="top:'+this.properties['Top'].getValue()+'px;left:'+this.properties['Left'].getValue()+'px;">'+this.properties['Text'].getValue()+'</div>';
      }

    };
  } else {
    return {
      type:"Box"
    };
  }
}


var getVismForm = function (vismfile) {
  return new Promise(function (resolve, reject) {
    var streamReader = require('./compiler/streamReader');
    var tokenizer    = require('./compiler/tokenizer');
    var vismParser   = require('./vismParser');

    vismParser.init(tokenizer(streamReader(vismfile)));

    var template = vismParser.next(); 
    var VismForm = {
      startUpForm: template.StartUpForm,
      limitedRows: template.LimitedRows,
      entities : {}
    };
    var dbTemplate = vismParser.next();
    VismForm.oDataURI = dbTemplate.Database;
    getSchema(dbTemplate).then(function (schema) {
      while(!vismParser.eof()) {
        var entity = getEntity(vismParser.next(), schema);
        VismForm.entities[entity.name] = entity;
      }
      resolve(VismForm);
    }).catch(function(err) {
      reject(err);
    });
  });
};

var preInterpret = function (exp, vismform, visform, template, lookupCols) {

  var findParent = function (ref, templates) {
    // TODO: lookup in children foreach template


    for(var template in templates) {

      if(template === ref) return templates[template];
      if(Object.keys(templates[template].children).length > 0) {
        findParent(ref, templates[template].children);
      }
    }

    return null;

    //for(var i=0, len=visform.template.length; i<len; i++) {
    //  if(visform.template[i].name === ref) return visform.template[i];
    //}
  }

  switch(exp.type) {
    case 'binary':
      preInterpret(exp.left, vismform, visform, template);
      if(exp.operator === 'WHERE') template.entitiesReady = true;
      preInterpret(exp.right, vismform, visform, template);
      break;

    case 'path':

      var service;
      var pathReader = function (path) {
        var pos = 0;

        function hasNext() {
          return (typeof path[pos] !== 'undefined');
        }

        function next() {
          return hasNext() ? path[pos++] : null;
        }

        function peek() {
          return path[pos] || null;
        }

        return {
          hasNext: hasNext,
          next: next,
          peek: peek
        }
      }

      var path = pathReader(exp.path);

      var fn = preInterpret(path.next(), vismform, visform, template, service);
      fn(path);

      break;

    case 'id':

      if(exp.value === 'Map') return function (path) {
        var entityRef = preInterpret(path.next(), vismform, visform, template, service);
        console.log(template.entitiesReady);
        if(!template.entitiesReady) {
          template.entities[entityRef] = vismform.entities[entityRef];
        } else {
          if(path.hasNext()) {
            var propName = preInterpret(path.next(), vismform, visform, template, service);
            var entity=template.entities[entityRef].properties[propName];
            entity.candidate = true;
          }
        }
      }
      
      if(exp.value === 'Form') return function (path) {
        if(!template.entitiesReady) {
          var parentRef = preInterpret(path.next(), vismform, visform, template);
          var parent = findParent(parentRef, visform.templateTree);
          template.parentRef = parent.name;
          parent.children[template.name] = template;
        } else {
          
        }
      }

      if(exp.value === 'Parent') return function (path) {
        var parent = findParent(template.parentRef, visform.templateTree);
        var propertyRef = preInterpret(path.next(), vismform, visform, template);
        var parentProp = parent.properties[propertyRef];
        if(typeof parentProp === 'undefined') 
          throw new Error("The requested property "+ propertyRef +" does not exist in the parent template " + parent.name);
      }

      return exp.value;
  }

  return null;
}

var createTemplateTree = function (vismform, visform) {
  visform.templateTree = {};
  for(var i=0, len=visform.template.length; i<len; i++) {
    var template = visform.template[i];
    preInterpret(template.rows, vismform, visform, template);
    if(!visform.template[i].parentRef)
      visform.templateTree[template.name] = template;
  }
}

var getVisForm = function (visfile, vismform) {

  return new Promise(function (resolve, reject) {
    var streamReader = require('./compiler/streamReader');
    var tokenizer    = require('./compiler/tokenizer');
    var visParser    = require('./visParser');
    var templates    = [];

    visParser.init(tokenizer(streamReader(visfile)));
    var visform = {
      template: undefined,
      templateTree: undefined
    };
    visform.template = visParser.parseVisformTemplate();
    createTemplateTree(vismform, visform);

    var traverseTree = function (templates) {

      for(var templateRef in templates) {

        var template = templates[templateRef];
        template.visComponent = getVisComponent(template.visComponent);

        template.entitiesReady = true;
        for(var propertyRef in template.properties) {
          if(typeof template.visComponent.properties[propertyRef] === 'undefined')
            throw new Error("The visComponent does not contain a definition for key " + propertyRef);
          var property = template.properties[propertyRef];
          preInterpret(property.formula, vismform, visform, template);
        }

        if(Object.keys(template.children).length > 0)
          traverseTree(template.children);
        
      }

    }

    traverseTree(visform.templateTree);

    /*visform.render = function () {
      return new Promise(function(resolve, reject) {
        resolve('<div id="">canvas</div>');
      });
    }*/

    resolve(visform);

  });
};

var allocate = function (visform, vismform) {

  return new Promise(function(resolve, reject) {

    var odata = require('./oDataQueryBuilder');

    var svc = odata.service(vismform.oDataURI, 'json');
    var queue = [];

    var traverseTree = function (templates) {
      for(var templateRef in templates) {
        var resource= "";
        var properties = [];

        var template = templates[templateRef];
        for(var entityRef in template.entities) {
          var entity = template.entities[entityRef];
          resource = entity.name;
          for(var propertyRef in entity.properties) {
            var property = entity.properties[propertyRef];
            if(property.candidate || property.isPkey) properties.push(propertyRef);
          }
        }
        var queryURI = svc.resource(resource).select(properties).toString();
        
        queue.push(new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            var templateRef = template.name;

            xhr.onreadystatechange = function() {
              if (xhr.readyState == 4 && xhr.status == 200) {
                console.log(templateRef);
                resolve({templateRef: templateRef, data:JSON.parse(xhr.responseText)});
              }
            }

            xhr.open("GET", queryURI);
            xhr.send();
          })
        );

        if(Object.keys(template.children).length > 0)
          traverseTree(template.children);
      }
    }

    traverseTree(visform.templateTree);

    Promise.all(queue).then(function(instancesSet) {
      visform.instancesSet = instancesSet;
      resolve(visform);
    });

  });
}

var evaluate = function (exp, vismform, visform, template, instance) {
  var getInstances = function (templateName) {
    for(var i=0, len=visform.instancesSet.length; i<len; i++) {
      var instances = visform.instancesSet[i];
      if(templateName === instances.templateRef) return instances;
    }
  }

  var findParent = function (ref, templates) {
    // TODO: lookup in children foreach template

    for(var template in templates) {
      if(template === ref) return templates[template];
      if(Object.keys(templates[template].children).length > 0) {
        findParent(ref, templates[template].children);
      }
    }
    return null;
  }

  var applyOp = function (op, a, b) {
    function num (x) {
      if(typeof x != 'number') 
        throw new Error("Expected number but got", +x);
      return x;
    }

    function div (x) {
      if(num(x) == 0)
        throw new Error("Divide by zero");
    }

    switch (op) {
      case "+"  : return num(a) + num(b);
      case "-"  : return num(a) - num(b);
      case "*"  : return num(a) * num(b);
      case "/"  : return num(a) / div(b);
      case "%"  : return num(a) % div(b);
      case "&&" : return a !== false && b;
      case "||" : return a !== false ? a : b;
      case "<"  : return num(a) < num(b);
      case ">"  : return num(a) > num(b);
      case "<=" : return num(a) <= num(b);
      case ">=" : return num(a) >= num(b);
      case "==" : return a === b;
      case "!=" : return a !== b;
    }
    throw new Error("Can't apply operator " + op);
  }

  switch(exp.type) {
    case 'binary':
      var L = evaluate(exp.left, vismform, visform, template, instance);
      var R = evaluate(exp.right, vismform, visform, template, instance);
      return applyOp(exp.operator, L, R);

    case 'path':
      var service;
      var pathReader = function (path) {
        var pos = 0;

        function hasNext() {
          return (typeof path[pos] !== 'undefined');
        }

        function next() {
          return hasNext() ? path[pos++] : null;
        }

        function peek() {
          return path[pos] || null;
        }

        return {
          hasNext: hasNext,
          next: next,
          peek: peek
        }
      }

      var path = pathReader(exp.path);
      var fn = evaluate(path.next(), vismform, visform, template, instance);
      return fn(path);
      break;

    case 'id':
      if(exp.value === 'Map') return function (path) {
        var entityRef = evaluate(path.next(), vismform, visform, template, instance);
        var entity = template.entities[entityRef];
        if(path.hasNext()) {
          var propRef = evaluate(path.next(), vismform, visform, template, instance);
          return instance.data[propRef];
          console.log(entityRef+"."+propRef, entity.properties[propRef]);
        } else {
        }
      }

      if(exp.value === 'Form') return function (path) {
        console.log('Form:', path.next());
      }

      if(exp.value === 'Parent') return function (path) {
        var parent = findParent(template.parentRef, visform.templateTree);
        var nextPathComponent = evaluate(path.next(), vismform, visform, template, instance);
        property = parent.properties[nextPathComponent];
        var componentProp = parent.bundle[instance.index].properties[property.key];
        return componentProp.computedValue || computedProp.genericValue;
      }

      if(exp.value === 'index') {
        return instance.index;
      }

      return exp.value;
  
    case 'num':
      return exp.value;
  };
}

var render = function (visform, vismform) {

  var clone = function (obj) {
    var copy;

    if (null == obj || "object" != typeof obj) return obj;
    if (obj instanceof Object) {
      copy = {};
      for (var attr in obj) {
          if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
      }
      return copy;
    }
  }

  var getInstances = function (templateName) {
    for(var i=0, len=visform.instancesSet.length; i<len; i++) {
      var instances = visform.instancesSet[i];
      if(templateName === instances.templateRef) return instances;
    }
  }

  var evaluateTree = function (tplTree) {

    for(templateRef in tplTree) {
      var template = tplTree[templateRef];
      var instances = getInstances(template.name).data.value;
      console.log("template:", template.name, "instances:", instances);
      for(var i=0, len=instances.length; i<len; i++) {
        var instance={index:i, data:instances[i]};
        var visComponent = clone(template.visComponent);
        for(propertyRef in template.properties) {
          var templateProp = template.properties[propertyRef];
          var computedValue = evaluate(templateProp.formula, vismform, visform, template, instance);
          visComponent.properties[templateProp.key].computedValue = computedValue;
          console.log("->", computedValue, visComponent.properties['Top'].computedValue);
        }
        
        console.log("visComponent:", visComponent);
        template.bundle.push(visComponent);
      }

      if(Object.keys(template.children).length > 0) {
        evaluateTree(template.children);
      }
    }
  }
  evaluateTree(visform.templateTree, null);

  var draw = function (tplTree) {
    for(templateRef in tplTree) {
      var template = tplTree[templateRef];
      console.log("template:", template.name);
      for(var i=0, len=template.bundle.length; i<len; i++) {
        console.log(template.bundle[i].toHTML());
      }
    }
  }
  
  draw(visform.templateTree);

}

var getVismFile = function (vismfileRef) {

  return new Promise(function (resolve, reject) {
    //config.vismFileManager(config.initialVismFile).then (function (vismfile) {
    getFile(vismfileRef).then (function (vismfile) {
      return getVismForm(vismfile);
    }).then(function (vismform) {
      return getVisFile(vismform);
    }).then(function (canvas) {
      resolve(canvas);
    }).catch(function (err) {
      reject(err);
    });
  });

}

var getVisFile = function (vismform) {

  return new Promise(function (resolve, reject) {
    getFile(vismform.startUpForm).then (function (visfile) {
      return getVisForm(visfile, vismform);
    }).then(function (visform) {
      return allocate(visform, vismform);
    }).then(function(visform) {
      render(visform, vismform);
    }).catch(function (err) {
      reject(err);
    });
  });

}

var getFile = undefined;

Kernel.registerFileProvider = function (provider) {
  getFile = provider;
};

Kernel.run = function (vismfileRef) {
  if(typeof getFile!=='function')
    throw new Error("The visEngine expects a file provider");
  getVismFile(vismfileRef).then(function (canvas) {
    console.log("done", canvas);
    
  }).catch(function (err) {
    console.log(err);
  });

};

/*Kernel.config = function (opts) {
  for(name in opts) {
    if(!(name in config)) throw new Error(name + " is not a configurable key");
    config[name] = opts[name];
  }
};*/


module.exports = Kernel;
