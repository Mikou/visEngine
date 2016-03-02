var fs = require('fs');

var packageJson = require(__dirname+'/../package.json');
var config = Object(packageJson || {});

var name = config.name;
var buildPath = config.buildPath;

var browserify = require('browserify');
var through = require('through');
var b = browserify({
  standalone: name
});
var output = "";

if (!fs.existsSync(buildPath))
  fs.mkdirSync(buildPath);

b.add(__dirname + '/../src/kernel.js');

b.transform(function (file) {
    var data = '';
    var clientConfig = {
      name: "uvis",
      version: "1.0.0",
      port: config.port,
      author: config.author
    };

    var header = "var config =" + JSON.stringify(clientConfig) + ";\n";

    return through(write, end);

    function write (buf) { data += buf }
    function end () {
        this.queue(header.concat(data));
        this.queue(null);
    }
});

b.bundle().pipe(
  fs.createWriteStream(__dirname + '/../' + buildPath + '' + name + '.js')
);
