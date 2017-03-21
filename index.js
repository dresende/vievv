var htmlparser   = require("htmlparser2");
var fs           = require("fs");
var path         = require("path");
var fileCache    = {};
var compileCache = {};

exports.filters = require("./filters");

exports.resolver = function (base_filename) {
	return function (include_filename) {
		var dst = path.resolve(path.dirname(base_filename), include_filename);

		if (path.basename(dst).indexOf(".") == -1) {
			dst += ".html";
		}

		return dst;
	};
};

exports.renderFile = function (filename, options, next) {
	if (typeof options == "function") {
		next      = options;
		options = {};
	}

	options.filename = filename;
	options.debug    = !options.cache;

	try {
		var template = exports.compile(filename, options);

		return next(null, template(options));
	} catch (err) {
		return next(err);
	}
};

exports.compile = function (filename, options) {
	options          = options || {};
	options.filename = path.resolve(filename);

	if (!options.cache || !compileCache.hasOwnProperty(filename)) {
		compileCache[filename] = (function () {
			var fn = build(parse(readFile(filename, options.cache), options), options);

			return function (scope) {
				return fn.call(scope, {
					filters : exports.filters,
					escape  : exports.escape,
				}, __rethrow);
			};
		})();
	}

	return compileCache[filename];
};

exports.render  = function (data, options) {
	options = options || {};

	return (function () {
		var fn = build(parse(data, options), options);

		return function (scope) {
			return fn.call(scope, {
				filters : exports.filters,
				escape  : exports.escape,
			}, __rethrow);
		};
	})()(options);
};

exports.escape = function (html) {
	return String(html)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/'/g, '&#39;')
		.replace(/"/g, '&quot;');
};

exports.printError = function (text) {
	return "<pre><code>" + text + "</code></pre>";
};

function build(blocks, options) {
	var buf = [];

	buf.push("var __buf=[];");
	buf.push("with(this){");
	if (options.debug) {
		buf.push("var __stack={};try{");
	}

	blocks.map((block) => {
		if (typeof block.compile == "function") {
			return buf.push(block.compile());
		}

		return buf.push("__buf.push(\"" + escapeString(block.toString()) + "\");");
	});

	if (options.debug) {
		buf.push("}catch(e){return __rethrow(e, __stack)}");
	}
	buf.push("}return __buf.join(\"\")");

	return new Function("__compiler, __rethrow", buf.join(""));
}

function parse(data, options) {
	var resolver  = (options.resolver || exports.resolver)(options.filename);
	var start_tag = options.start || "<%";
	var end_tag   = options.end || "%>";
	var offset    = 0;
	var start     = 0;
	var end       = 0;
	var file      = options.filename;
	var line      = 1;
	var blocks    = [];

	if (options.debug) {
		blocks.push(new Stack({ file: file }));
	}

	while (offset < data.length) {
		start = data.indexOf(start_tag, offset);
		if (start == -1) break;

		if ((Buffer.isBuffer(data) && String.fromCharCode(data[start + start_tag.length]) == start_tag.substr(-1))
		|| (data[start + start_tag.length] == start_tag.substr(-1))) {
			blocks.push(data.slice(offset, start + start_tag.length));
			offset = start + start_tag.length + 1;
			continue;
		}

		if (options.debug) {
			line += (("" + data.slice(offset, start)).match(/\n/g) || []).length;
		}

		end = data.indexOf(end_tag, start + start_tag.length);
		if (end == -1) throw new Error("End tag not found");

		if (start > offset) {
			blocks.push(data.slice(offset, start));
		}

		var scope = new Scope(data.slice(start + start_tag.length, end), resolver, options);
		if (options.debug) {
			blocks.push(new Stack({ line: line }));
		}
		blocks.push(scope);
		if (options.debug && scope.include()) {
			blocks.push(new Stack({ file: file }));
		}

		offset = end + end_tag.length;
	}

	if (offset < data.length) {
		blocks.push(data.slice(offset));
	}

	return blocks;
}

function Stack(data) {
	return {
		compile: () => {
			var buf = [];
			for (var k in data) {
				switch (typeof data[k]) {
					case "number":
						buf.push("__stack." + k + "=" + data[k] + ";");
						break;
					case "string":
						buf.push("__stack." + k + "=\"" + escapeString(data[k]) + "\";");
						break;
				}
			}
			return buf.join("");
		}
	};
}

function Scope(data, resolver, options) {
	return {
		include: () => {
			return (("" + data).trim().substr(0, 8) == "include ");
		},
		compile: () => {
			data = ("" + data).trim();

			switch (data[0]) {
				case "=": // escape data (html)
					if (data[1] == ":") {
						// filter
						return "__buf.push(__compiler.escape(" + data.substr(2).trim().split(" | ").reduce((js, filter) => {
							return "__compiler.filters." + filter.trim() + "(" + js + ")";
						}) + "));";
					}
					return "__buf.push(__compiler.escape(" + data.substr(1).trim() + "));";
				case "-": // raw data
					if (data[1] == ":") {
						// filter
						return "__buf.push(" + data.substr(2).trim().split(" | ").reduce((js, filter) => {
							return "__compiler.filters." + filter.trim() + "(" + js + ")";
						}) + ");";
					}
					return "__buf.push(" + data.substr(1).trim() + ");";
				case "#": // disabled, no output
					return "";
			}

			data = ("" + data).trim();

			if (data.substr(0, 8) == "include ") {
				var m = data.match(/^include\s+([^\s\()]+)(\s*\((.+)\))?$/);

				if (!m) return "throw new Error(\"Unknown include '" + escapeString(data) + "'\")";

				var filename = resolver(m[1], options);
				var buf      = [];

				buf.push("__buf.push(((__compiler) => {");
				buf.push("var __buf=[],self = " + (m[3] && m[3].length ? m[3] : "{}") + ";");

				options.filename = filename;

				parse(readFile(filename, options.cache), options).map((block) => {
					if (typeof block.compile == "function") {
						return buf.push(block.compile());
					}

					return buf.push("__buf.push(\"" + escapeString(block.toString()) + "\");");
				});

				buf.push("return __buf.join(\"\")})(__compiler));");

				return buf.join("");
			}

			return data + "\n";
		}
	};
};

function readFile(filename, do_cache) {
	if (filename == "empty://") {
		return "";
	}
	if (!do_cache || !fileCache.hasOwnProperty(filename)) {
		fileCache[filename] = fs.readFileSync(filename);
	}

	return fileCache[filename];
}

function escapeString(js) {
	return String(js)
		.replace(/\\/g, "\\\\")
		.replace(/\"/g, "\\\"")
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t")
		.replace(/\\b/g, "\\b")
		.replace(/\f/g, "\\f");
}

function __rethrow(e, d) {
	for (var k in d) {
		e[k] = d[k];
	}

	if (e.file && e.line) {
		var data   = ("" + fs.readFileSync(d.file));
		var offset = 2;
		var from   = d.line - offset - 1;
		var to     = d.line + offset;

		if (from < 1) {
			from = 1;
		}

		var output = d.file + ": " + ("" + e) + "\n" +
		             data.split(/\n/).slice(from - 1, to).map((line, i) => {
		                 return (from + i == d.line ? ">>> " : "    ") +
		                        padN(from + i, ("" + d.line).length + 1) + ". | " +
		                        line;
		             }).join("\n");

		process.stderr.write(output + "\n");

		return exports.printError(output);;
	}

	throw e;
}

function padN(v, n) {
	v = "" + v;
	if (v.length >= n) return v;

	return (new Array(n - v.length + 1)).join(" ") + v;
}
