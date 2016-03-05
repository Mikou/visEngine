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
        Top: {genericValue: 10},
        Left: {genericValue: 10},
        Text: {genericValue: "My Empty TextBox"}
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
      if(Object.keys(templates[template].children) > 0) {
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
            console.log("---->", entityRef, propName);
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
          if(property.key === 'Text') console.log("TEXT: -----------------");
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

var evaluate = function (exp, vismform, visform, template, instance) {
  switch(exp.type) {
    case 'binary':
      var L = evaluate(exp.left, vismform, visform, template, instance);
      var R = evaluate(exp.right, vismform, visform, template, instance);
      return L+R;

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
        console.log('Parent:', path.next());
      }

      if(exp.value === 'index') {
        console.log("INDEX::::", instance);
        return instance.index;
      }

      return exp.value;
  
    case 'num':
      return exp.value;
  };
}

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

var render = function (visform, vismform) {

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
        for(property in template.properties) {
          console.log("  Property: ", template.properties[property].key, evaluate(template.properties[property].formula, vismform, visform, template, instance));
        }
      }
    }

  }

  evaluateTree(visform.templateTree);

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
