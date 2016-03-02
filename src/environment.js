function Environment(parent) {
    this.cids = 0;
    this.eid = "g";
    this.vars = Object.create(parent ? parent.vars : null);
    this.parent = parent;
}
Environment.prototype = {
  extend: function(tn) {
    var e = new Environment(this);
    this.cids++;
		e.eid = this.eid + "." + tn + this.cids;
    return e;
  },
  lookup: function(name) {
    var scope = this;
    while (scope) {
      if (Object.prototype.hasOwnProperty.call(scope.vars, name))
        return scope;
      scope = scope.parent;
    }
  },
  get: function(name) {
    if (name in this.vars)
      return this.vars[name];
    throw new Error("Undefined variable " + name);
  },
  set: function set (name, value) {
    var scope = this.lookup(name);
    // let's not allow defining globals from a nested environment
    if (!scope && this.parent)
      throw new Error("Undefined variable " + name);
    return (scope || this).vars[name] = value;
  },
  def: function(name, value) {
    return this.vars[name] = value;
  }
};

module.exports = Environment;
