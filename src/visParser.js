var ts;
var current = null;

var PRECEDENCE = {
  "=": 1, ":": 1, "&": 1,
  "-<": 2,
  "WHERE": 3,
  "<": 7, ">": 7, "<=": 7, ">=": 7, "==": 7, "!=": 7,
  "+": 10, "-": 10,
  "*": 20, "/": 20, "%": 20,
};

function is_op(op) {
  var tok = ts.peek();
  return tok && tok.type == "op" && (!op || tok.value == op) && tok;
}

function is_EOL(ch) {
  var tok = ts.peek();
  return tok && tok.type == 'EOL' && (!ch || tok.value == ch) && tok;
}

function is_punc(ch) {
  var tok = ts.peek();
  return tok && tok.type == "punc" && (!ch || tok.value == ch) && tok;
}
function skip_separator() {
  var tok = ts.peek();
  if (tok.type == "separator") ts.next();
  else ts.croak("Expecting a Template Separator : ");
}
function skip_EOL() {
  var tok = ts.peek();
  if (tok.type === "EOL") ts.next();
  else ts.croak("Expecting EOL");
}
function skip_punc(ch) {
  if (is_punc(ch)) ts.next();
  else ts.croak("Expecting punctuation: \"" + ch + "\"");
}

// extends an expression as much as possible to the right
function maybe_binary(left, my_prec) {
  var tok = is_op();
  if (tok) {
    //console.log(PRECEDENCE);
    var his_prec = PRECEDENCE[tok.value];
    if (his_prec > my_prec) {
      ts.next();
      var right = maybe_binary(parse_atom(), his_prec);

      return maybe_binary({
        type     : "binary",
        operator : tok.value,
        left     : left,
        right    : right//maybe_binary(parse_atom(), his_prec)
      }, my_prec);
    }
  }
  return left;
}

function delimited(start, stop, separator, parser) {
  var a = [], first = true;
  skip_punc(start);
  while (!ts.eof()) {
    if (is_punc(stop)) break;
    if (first) first = false; else skip_punc(separator);
    if (is_punc(stop)) break;
    a.push(parser());
  }
  skip_punc(stop);
  return a;
}

function parse_atom() {
  var tok = ts.next();

  if (tok.type === "id"   ||
      tok.type === "datetime"  ||
      tok.type === "key"  ||
      tok.type === "path" ||
      tok.type === "num"  || 
      tok.type === "str")
    return tok;
}

function skip_separator() {
  var tok = ts.peek();
  if (tok.type == "separator") ts.next();
  else ts.croak("Expecting a Template Separator : ");
}

function skip_EOL() {
  var tok = ts.peek();
  if (tok.type === "EOL") ts.next();
  else ts.croak("Expecting EOL");
}

function parse_formula () {
  while(!ts.eof() && ts.peek().type !== 'EOL' ){
    return maybe_binary(parse_atom(), 0);
  }
}

function parseProperty () {
  var key = ts.next();
            ts.next(); // skip semicolon
  var formula = parse_formula();
  return {key: key.value, formula: formula};
}

function parseTemplate () {
  var properties = [];
  var template = {
    type:'template',
    properties: [],
    entities: {},
    children: {},
    entitiesReady:false,
    visComponent:undefined
  }
  while(!ts.eof() && ts.peek().type !== 'separator') {
    var property = parseProperty();
    if(property.key==='Rows') {
      template.rows = property.formula;
    } else if(property.key==='TextBox') {
      template.visComponent = property.key;
      template.name = property.formula.value;
    } else {
      template.properties.push(property);
    }
    if(!ts.eof()) skip_EOL();
  }
  if(ts.peek().type === 'separator') skip_separator();
  return template;
  //return {type:"template", properties:properties, entities:[], children: {}, visComponent:undefined};
}

function parseVisformTemplate () {
  templates = [];
  while(!ts.eof()) {
    templates.push(parseTemplate());
  }
  return templates;
}

function readNext() {
  if(ts.eof()) return null;
  return parseTemplate();
}

function peek () {
  return current || (current = readNext());
}

function next () {
  var template = current;
  current = null;
  return template || readNext();
}

function eof () {
  return peek() === null;
}

function init (tokenStream) {
  ts = tokenStream;
};

module.exports = {
  init: init,
  next: next,
  peek: peek,
  eof: eof,
  parseVisformTemplate: parseVisformTemplate
};

