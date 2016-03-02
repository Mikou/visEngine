var ts;
var current = null;

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

function parseAtom () {
  tok = ts.next();
  return tok.value;
}

function parseFormula () {
  while(!ts.eof() && ts.peek().type !== 'EOL') {
    return parseAtom();
  }
}

function parseProperty () {
  var key = ts.next();
            ts.next(); // jump over semicolon op;
  var exp = parseFormula();
  return {key: key.value, value: exp};
}

function parseTemplate () {
  template = {};
  while( !ts.eof() && ts.peek().type !== 'separator' ) {
    while( ts.peek().type === 'EOL' ) skip_EOL();
    var property = parseProperty();
    template[property.key] = property.value;
    if(!ts.eof()) skip_EOL();
  }

  if(ts.peek().type === 'separator') skip_separator();
  return template;
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
  eof: eof
};

