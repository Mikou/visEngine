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
      children: new Array(),
      toHTML: function () {
        var elem = document.createElement('div');
        elem.style.top = this.properties['Top'].getValue();
        elem.style.left = this.properties['Left'].getValue();
        elem.textContent = this.properties['Text'].getValue();

        return elem;
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
    resolve(visform);
  });
};

var buildQueryStr = function (URI, query) {
  
  var traverse = function (query, expanded) {
    var queryStr = "";
    var select = "($select=" + query.properties.toString() + ")";
    var resource = query.resource;

    if(expanded) {
      queryStr += "&$expand=";
    } else {
      resource += "?";
    };

    queryStr += resource + "" + select;

    for(var i=0, len=query.expand.length; i<len; i++) {
      queryStr += traverse(query.expand[i], true);
    }

    return queryStr;
  }
  return URI + "" + traverse(query, false) + "&format=json";
}

var allocate = function (visform, vismform) {

  return new Promise(function(resolve, reject) {

    var queue = [];

    //TODO : We only look at level 1 of the tree for now
    var traverseTree = function (templates) {
      for(var templateRef in templates) {
        var template = templates[templateRef];
        
        queue.push(new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            var templateRef = template.name;

            xhr.onreadystatechange = function() {
              if (xhr.readyState == 4 && xhr.status == 200) {
                //var obj={};
                //obj[templateRef] = JSON.parse(xhr.responseText);
                resolve(JSON.parse(xhr.responseText));
              }
            }

            console.log(template.queryStr);
            xhr.open("GET", template.queryStr);
            xhr.send();
        }));
      }
    }

    traverseTree(visform.templateTree);

    Promise.all(queue).then(function(instancesSet) {
      visform.instancesSet = instancesSet;
      console.log(visform);
      resolve(visform);
    });

  });
}


var buildQueries = function (visform, vismform) {

    var findParent = function (ref, templates) {
      for(var template in templates) {
        if(template === ref) return templates[template];
        if(Object.keys(templates[template].children).length > 0) {
          findParent(ref, templates[template].children);
        }
      }
      return null;
    }


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

        var query = {
          resource: resource,
          properties: properties,
          expand:[]
        };

        if(template.parentRef) {
          parent = findParent(template.parentRef, visform.templateTree);
          parent.query.expand.push(query);
        } else {
          template.query = query;
        }
        
        if(Object.keys(template.children).length > 0) {
          traverseTree(template.children);
        }
    }

  }

  traverseTree(visform.templateTree);

  for(var templateRef in visform.templateTree) {
    var template = visform.templateTree[templateRef];
    template.queryStr = buildQueryStr(vismform.oDataURI, template.query);
  }
}

var evaluate = function (exp, vismform, visform, template, instance) {
  var getInstances = function (entityRef) {
    for(var idx in visform.instancesSet) {
      var instance = visform.instancesSet[idx];
      if(("$metadata#"+entityRef) === instance["@odata.context"])
        return instance.value;
    }
    throw new Error("Data instances for entity " +entityRef+ " not found.");
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

    function str(x) {
      if(typeof x != 'string')
        throw new Error('Expected String but got ', +x)
      return x;
    }

    function obj(x) {
      if(typeof x != 'object')
        throw new Error("Expected array but got ", +x);
      return x;
    }

    switch (op) {
      case "-<" : return obj(a)[str(b)];
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
      var L = evaluate(exp.left, vismform, visform, template);
      if(!template.entitiesReady && exp.operator === 'WHERE') return L;
      var R = evaluate(exp.right, vismform, visform, template);

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
      var fn = evaluate(path.next(), vismform, visform, template);
      return fn(path);

    case 'id':
      if(exp.value === 'Map') return function (path) {
        var entityRef = evaluate(path.next(), vismform, visform, template);
        
        if(!template.entitiesReady) {
          if(!template.parentRef) {
            return getInstances(entityRef);
          } else {
            return entityRef;
          }
        } else {
          var entityPropRef = evaluate(path.next(), vismform, visform, template);
          return template.currentRow[entityPropRef];
        }
      }

      if(exp.value === 'Form') return function (path) {
        var entityRef = evaluate(path.next(), vismform, visform, template);
        if(!template.entitiesReady && template.parentRef) {
          parent = findParent(template.parentRef, visform.templateTree);
          return parent.currentRow;
        }
      }

      if(exp.value === 'Parent') return function (path) {
        var parent = findParent(template.parentRef, visform.templateTree);
        var parentPropertyRef = evaluate(path.next(), vismform, visform, template);
        var parentProperty = parent.bundle[parent.currentIndex].properties[parentPropertyRef];        

        return parentProperty.getValue();
      }

      if(exp.value === 'index') {
        return template.currentIndex;
      }

      return exp.value;
  
    case 'num':
      return exp.value;
  };
}

var render = function (visform, vismform) {
  visform.canvas = {
    instanceTree: {},
  };

  var visform.instanceTree = {};

  function VisComponent(proto) {
    this.name = proto.name;
    this.properties = {};
    for(propRef in proto.properties) {
      this.properties[propRef] = proto.properties[propRef];
    }
    this.children = [];
  }

  function Tree (proto) {
    var component = new VisComponent(proto);
    this._root = component;
  }

  // http://stackoverflow.com/a/728694/971008
  // We do not use a function constructor to instanciate a visComponent with the 'new' keyword
  // The reason is that earlier in the process we need an actual representation of an instance 
  // of the visComponent so that template properties can be validated against the properties of
  // the visComponent being addressed.
  // Maybe there is a smarter way to do this than "deep cloning" the object.
  // In all cases, without a "deep clone", all VisComponent instances end up refereing to the
  // same object.

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

  var findParent = function (ref, templates) {
    for(var template in templates) {
      if(template === ref) return templates[template];
      if(Object.keys(templates[template].children).length > 0) {
        findParent(ref, templates[template].children);
      }
    }
    return null;
  }

  var evaluateFormulas = function (template, visComponent) {
    for(var propertyRef in template.properties) {
      var property = template.properties[propertyRef];
      var computedValue = evaluate(property.formula, vismform, visform, template);
      visComponent.properties[propertyRef].computedValue = computedValue;
    }
  }

  var evaluateTree = function (tplTree) {
    for(templateRef in tplTree) {
      var bundle;
      var template = tplTree[templateRef];
      // assign instances to template
      template.entitiesReady = false;
      var instances = evaluate(template.rows, vismform, visform, template);
      template.entitiesReady = true;

      if(!template.parentRef) {
        template.bundle = new Array();
        bundle = template.bundle;
      }

      for(var i=0, len=instances.length; i<len; i++) {
        var instance = instances[i];
        var visComponent = clone(template.visComponent);
        visComponent.children = []; // TODO: quick fix. clone transformed children into an object
        template.currentIndex = i;
        template.currentRow = instance;

        if(template.parentRef) {
          var parent = findParent(template.parentRef, visform.templateTree);
          bundle = parent.bundle[parent.currentIndex].children;
        }

        evaluateFormulas(template, visComponent);
        bundle.push(visComponent);
        if(Object.keys(template.children).length > 0) {
          evaluateTree(template.children);
        }
      }
    }
  }
  evaluateTree(visform.templateTree, null);

  var draw = function (tplTree) {
    for(templateRef in tplTree) {
      var template = tplTree[templateRef];
      for(var i=0, len=template.bundle.length; i<len; i++) {
        var bundle = template.bundle[i];

        console.log(bundle);
        container.appendChild(template.bundle[i].toHTML()); 
        if(Object.keys(template.children).length > 0) {
          draw(template.children);
        }
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
      buildQueries(visform, vismform);
      return allocate(visform, vismform);
      //return allocate(visform, vismform);
    }).then(function(visform) {
      render(visform, vismform);
      console.log(visform);
    }).catch(function (err) {
      reject(err);
    });
  });

}

var getFile = undefined;
var container;

Kernel.registerFileProvider = function (provider) {
  getFile = provider;
};

Kernel.run = function (vismfileRef, $container) {
  container = $container;
  if(typeof getFile!=='function')
    throw new Error("The visEngine expects a file provider");
  getVismFile(vismfileRef).then(function (canvas) {
    console.log("done", canvas);
    
  }).catch(function (err) {
    console.log(err);
    throw err;
  });
};

module.exports = Kernel;
