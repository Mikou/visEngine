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
  return new Promise(function(resolve, reject) {

    if(componentName === 'TextBox') {
      setTimeout(function() { resolve({type:'textBox'})}, 100);
    } else {
      setTimeout(function() { resolve({type:'Box'})}, 500);

    }

  });
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
    getSchema(vismParser.next()).then(function (schema) {
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

  var findParent = function (ref, visform) {
    // TODO: lookup in children foreach template
    for(var i=0, len=visform.template.length; i<len; i++) {
      if(visform.template[i].name === ref) return visform.template[i];
    }
  }

  switch(exp.type) {
    case 'binary':
      preInterpret(exp.left, vismform, visform, template);
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
          console.log(visform.templateTreeReady);
          if(!visform.templateTreeReady) {
            template.entities[entityRef] = vismform.entities[entityRef];
          } else {

            if(path.hasNext()) {
              var propName = preInterpret(path.next(), vismform, visform, template, service);
              //var entity=template.entities[propName];
              console.log(entityRef, template.entities, propName);
              //entity.properties[preInterpret(path.next(), vismform, visform, template, service)].candidate=true;
            }
          }
        }
      
      if(exp.value === 'Form') return function (path) {
          if(!template.entitiesReady) {
            var parent = findParent(preInterpret(path.next(), vismform, visform, template), visform);
            /*var parent = {
              entitiesReady:false,
              name: template.parentRef,
              type: undefined,
              properties: undefined,
              children: {},
              //children[template.name]: template,
              entities: {}
            };*/
            template.parentRef = parent.name;
            parent.children[template.name] = template;
            //parent.children[template.name] = template;
          } else {
            
          }
        }

      if(exp.value === 'Parent') return function (path) {
          var parent = findParent(template.parentRef);
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
  visform.templateTreeReady = false;
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
    //var Environment = require('./environment');
    //var env = new Environment(null);

    var promises = [];

    visform.template = visParser.parseVisformTemplate();
    createTemplateTree(vismform, visform);


    visform.templateTreeReady = true;

    var preDef = function (templates) {

      for(var template in templates) {

        console.log(templates[template]);

        for(var i=0, len=templates[template].properties.length; i<len; i++) {
          preInterpret(templates[template].properties[i], vismform, visform, templates[template]);
        }

        if(Object.keys(templates[template].children) > 0);
          preDef(templates[template].children);
        
      }

    }

    preDef(visform.templateTree);

    /*for(var i=0, len< Object.keys(visform.templateTree).length; i<len; i++) {
      console.log(i);
    }*/
    /*function createTemplate(input) {
      promises.push(new Promise(function(resolve, reject) {
        
        getVisComponent(input.properties[0].key).then(function(visComponent) {

          var template = {
            entitiesReady:false,
            name: input.properties[0].formula.value,
            type: visComponent,
            properties: {},
            children: {},
            entities: {}
          }

          // (1) preInterpret ROWS
          try {
            preInterpret(input.properties[1].formula, vismform, visform, template);
          } catch (e) {
            reject(e);
          }
          template.entitiesReady = true;
          
          // (2) preInterpret all other properties
          for(var i=2, len=input.properties.length; i<len; i++) {
            try {
              template.properties[input.properties[i].key] =input.properties[i].formula;
              preInterpret(input.properties[i].formula, vismform, visform, template);
            } catch (e) {
              reject(e);
            }
          }
          if(!template.parentRef) {
            console.log(visform.templates);
            visform.templates[template.name] = template;
          }

          resolve(visform);

        });

      }));
    }


    while(!visParser.eof()) {
      createTemplate(visParser.next());
    }

    Promise.all(promises).then(function (visform) {
      resolve(visform);
    })
    /*while(!visParser.eof()) {
        console.log(count++);
        var template = {
          entitiesReady:false,
          name: visParser.peek().properties[0].formula.value,
          type: visParser.peek().properties[0].key,
          properties: {},
          children: {},
          entities: {}
        }

        //env.def("vismform", vismform);
        //env.def("visform",  visform );
        //env.def("template", template);
        //env.def("service" , null    );

        // (1) preInterpret ROWS
        try {
          preInterpret(visParser.peek().properties[1].formula, vismform, visform, template);
        } catch (e) {
          console.log(e);
        }
        template.entitiesReady = true;
        
        // (2) preInterpret all other properties
        for(var i=2, len=visParser.peek().properties.length; i<len; i++) {
          try {
            template.properties[visParser.peek().properties[i].key] =visParser.peek().properties[i].formula;
            preInterpret(visParser.peek().properties[i].formula, vismform, visform, template);
          } catch (e) {
            console.log(e);
          }

        }
        if(!template.parentRef)
          visform.templates[template.name] = template;

        visParser.next();
    }*/

    //reject(visfile);
  });
};

var getVismFile = function (vismfileRef) {

  return new Promise(function (resolve, reject) {
    //config.vismFileManager(config.initialVismFile).then (function (vismfile) {
    getFile(vismfileRef).then (function (vismfile) {
      return getVismForm(vismfile);
    }).then(function (vismform) {
      return getVisFile(vismform);
    }).then(function (canvas) {
      resolve("<div>canvas</div>");
    }).catch(function (err) {
      reject(err);
    });
  });

}

var getVisFile = function (vismform) {

  return new Promise(function (resolve, reject) {
    getFile(vismform.startUpForm).then (function (visfile) {
      return getVisForm(visfile, vismform);
    }).then(function(visform) {
      console.log(visform);
      resolve(visform);
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
