(function () {
  var visfile = String()
  + 'TextBox:Person\n'
  + 'Rows:Map.People\n'
  + 'Top:10+index*25\n'
  + 'Left:10\n'
  + 'Text:Map.People.Name\n'
  + '-------------\n'
  + 'TextBox:PersonActivities\n'
  + 'Rows:Form.Person -< Map.Activities Where Map.Activities.Start > #2016-01-29#\n'
  + 'Top:Parent.Top\n'
  + 'Left:10\n'
  + 'Text:Map.Activities.Name\n'
  + '-------------\n'
  + 'TextBox:Person2\n'
  + 'Rows:Map.People\n'
  + 'Top:10+index*25\n'
  + 'Left:10\n'
  + 'Text:Map.People.Name\n'
  + '-------------\n'

  ;

  var vismfile = String()
  + 'StartUpForm: "initial.vis"\n'
  + 'RenderEngine: WebComponents\n'
  + 'LimitedRows: 0\n'
  + 'SimulatedUpdate: true\n'
  + '----------------\n'
  + 'Database: "http://localhost:8088/service.svc/"\n'
  + '----------------\n'
  + 'Table: People\n'
  + 'ID: "NOT YET IMPLEMENTED"\n'
  + 'Age: "NOT YET IMPLEMENTED"\n'
  + 'Name: "NOT YET IMPLEMENTED"\n'
  + '----------------\n'
  + 'Table: Activities\n'
  + 'ID: "NOT YET IMPLEMENTED"\n'
  + 'Name: "NOT YET IMPLEMENTED"\n'
  + 'Start: "NOT YET IMPLEMENTED"\n'
  + 'End: "NOT YET IMPLEMENTED"\n'
  + '----------------\n'
  ;

  /*uvis.config({
    vismFileManager: function (filename) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          if(filename = 'dummyVismFile') resolve( vismFile );
          reject(new Error("vismFile " +filename+ " was not found"));
        }, 1000);
      });
    },
    visFileManager: function (filename) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          if(filename = 'dummyVisFile') resolve (visFile);
          reject(new Error("visFile " +filename+ " was not found"))
        }, 1000);
      });
    },
    initialVismFile: "dummyVismFile",
    odatajs: odatajs
  });*/

  uvis.registerFileProvider(function (filename) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if(filename === 'initial.vism') {resolve (vismfile);}
        else if(filename === 'initial.vis') {resolve (visfile);}
        else { reject("file " + filename + " not found!"); }
      }, 1000); 
    });
  });

  uvis.odatajs = odatajs;

  uvis.run('initial.vism');

})();
