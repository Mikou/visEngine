var moment = require('moment');
var validDate = ['D-M-YYYY HH:mm:SS', 'D-M-YYYY', 'HH:mm:SS'];


function TokenStream(input) {
  
  if(!input) throw Error('No formula was provided as an input parameter');

  var current = null;
  var isPropertyKey = true;

  var visComponents = " TextBox Form ";

  return {
    next  : next,
    peek  : peek,
    eof   : eof,
    croak : input.croak
  };

  function is_visComponent(x) {
    return visComponents.indexOf(" " + x + " ") >= 0;
  }
  function is_digit(ch) {
    return /[0-9]/i.test(ch);
  }
  function is_id_start(ch) {
    return /[a-zA-Z]/i.test(ch);
  }
  function is_id(ch) {
    return is_id_start(ch) || "?!-<>=0123456789".indexOf(ch) >= 0;
  }
  function is_op_char(ch) {
    return ":+-*/%=&|<>".indexOf(ch) >= 0;
  }
  function is_punc(ch) {
    return ",;(){}[].".indexOf(ch) >= 0;
  }
  function is_whitespace(ch) {
    return " \t".indexOf(ch) >= 0;
  }
  function read_while(predicate) {
    var str = "";
    while (!input.eof() && predicate(input.peek())){
      str += input.next();
    }
    return str;
  }
  function read_number() {
    var has_dot = false;
    var number = read_while(function(ch){
      if (ch === ".") {
        if (has_dot) return false;
          has_dot = true;
          return true;
        }
      return is_digit(ch);
    });
    return { type: "num", value: parseFloat(number) };
  }

  function read_ident() {    

    var pathComponents = [];
    var id = "";
    var is_path = false;

    while( input.peek() === "." || is_id(input.peek())){
      id = read_while(is_id);
      pathComponents.push({type:"id", value:id});
      //skip_punc();
      if(input.peek() === ".") {
        is_path = true;
        input.next();
      }
    }

    if(id.toUpperCase() === 'WHERE') {
      return {type:"op", value:"WHERE"};
    }

    if(is_path) {
      return {
        type: 'path',
        path: pathComponents
      }
    } else {
      return {
        type: 'id',
        value: id
      }
    }
  }

  function maybe_path() {
    
  }

  // We use momentJS to ease the parsing of a date
  // thus it scans the date twice
  function read_datetime(format){
    var ch=input.next();

    var date=String();
    while(!input.eof()){
      ch = input.next();
      if(ch==='#') break;
      date+=ch;
    }
    date = moment(date, validDate, true);
    if(!date.isValid()) date = moment(0);

    //date = moment(0);

    return { type: "datetime", value: date};
  }
  
  function read_tplSeparator () {
    var ch=input.next();
    var separator = String();
    while(!input.eof()){
      ch = input.next();
      if(ch === '\n') break;
      separator+= ch;
    }

    return {type: "separator", value: separator};
  }

  function read_escaped (end) {
    var escaped = false, str = "";
    input.next();
    while (!input.eof()) {
      var ch = input.next();
      if (escaped) {
        str += ch;
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === end) {
        break;
      } else {
        str += ch;
      }
    }
    return str;
  }
  
  function read_path () {
    return { type: "pathSeparator", value: "."};
  }

  function read_string () {
    return { type: "str", value: read_escaped('"') };
  }
  function skip_comment () {
    read_while(function(ch){ return ch != "\n" });
    input.next();
  }

  function read_next() {
    read_while(is_whitespace);
    if (input.eof()) return null;
    var ch = input.peek();
    // COMMENT (skip it)
    if (ch === "'") {
      skip_comment();
      return read_next();
    }
    // DATETIME
    if (ch === "#")      return read_datetime();
    // STRING
    if (ch === '"')      return read_string();
    // NUMBER
    if (is_digit(ch))    return read_number();
    // IDENT
    if (is_id_start(ch)) return read_ident();
    // PATH
    if (ch === ".")      return read_path();
    // EOL
    if (ch === "\n") {
      isPropertyKey = true;
      return { type:"EOL", value: input.next() }
    }

    if (is_punc(ch)) return {
      type  : "punc",
      value : input.next()
    };

    if(is_op_char(ch)) {
      tok = input.next();
      if(!is_op_char(input.peek())) return {type:"op", value: tok};
      if(tok === "-" && input.peek() === "-") {
        while(!input.eof() && ch !== '\n') {
          ch = input.next();
        }
        return {type:"separator", value: "--"};
      }
      if(tok === "-" && input.peek() === "<")
        return {type:"op", value:tok + input.next()}
    };


    input.croak("Can't handle character: " + ch);
  }
  function peek(){
    return current || (current = read_next());
  }
  function next(){
    var tok = current;
    current = null;
    return tok || read_next();
  }
  function eof(){
    return peek() === null;
  }

  function croak(){}
}

/* ---------- [ Entry point ] -----------*/

/*if (typeof process != "undefined") (function () {
  var util = require('util');
  
  var str = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("readable", function(){
    var chunk = process.stdin.read();
    if (chunk) str += chunk;
  });
 
  process.stdin.on("end", function(){
		var inputStream = require('./inputStream');

   	var tokenStream = TokenStream(inputStream(str));
    console.log(tokenStream.next());
    //tokenStream.next();
  });
})();*/


module.exports = TokenStream;
