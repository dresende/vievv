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

	var str;

	try {
		var template = exports.compile(filename, options);
	} catch (err) {
		return next(err);
	}

	return next(null, template(options));
};

exports.compile = function (filename, options) {
	options          = options || {};
	options.filename = filename;

	if (!options.cache || !compileCache.hasOwnProperty(filename)) {
		compileCache[filename] = (function () {
			var buf = [];
			var fn;

			buf.push("var __buf=[];");
			buf.push("with(this){");

			parse(readFile(filename, options.cache), options).map((block) => {
				if (typeof block.run == "function") {
					return buf.push(block.run());
				}

				return buf.push("__buf.push(\"" + escapeString(block.toString()) + "\");");
			});

			buf.push("}return __buf.join(\"\")");

			fn = new Function("__compiler", buf.join(""));

			return function (scope) {
				return fn.call(scope, {
					filters : exports.filters,
					escape  : exports.escape,
				});
			};
		})();
	}

	return compileCache[filename];
};

exports.render  = function (data, options) {
	options = options || {};

	return (function () {
		var buf = [];
		var fn;

		buf.push("var __buf=[];");
		buf.push("with(this){");

		parse(data, options).map((block) => {
			if (typeof block.run == "function") {
				return buf.push(block.run());
			}

			return buf.push("__buf.push(\"" + escapeString(block.toString()) + "\");");
		});

		buf.push("}return __buf.join(\"\")");

		fn = new Function("__compiler", buf.join(""));

		return function (scope) {
			return fn.call(scope, {
				filters : exports.filters,
				escape  : exports.escape,
			});
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

function parse(data, options) {
	var resolver  = (options.resolver || exports.resolver)(options.filename);
	var start_tag = options.start || "<%";
	var end_tag   = options.end || "%>";
	var offset    = 0;
	var start     = 0;
	var end       = 0;
	var blocks    = [];

	while (offset < data.length) {
		start = data.indexOf(start_tag, offset);
		if (start == -1) break;

		if ((Buffer.isBuffer(data) && String.fromCharCode(data[start + start_tag.length]) == start_tag.substr(-1))
		|| (data[start + start_tag.length] == start_tag.substr(-1))) {
			blocks.push(data.slice(offset, start + start_tag.length));
			offset = start + start_tag.length + 1;
			continue;
		}

		end = data.indexOf(end_tag, start + start_tag.length);
		if (end == -1) throw new Error("End tag no found");

		if (start > offset) {
			blocks.push(data.slice(offset, start));
		}

		blocks.push(new Scope(data.slice(start + start_tag.length, end), resolver, options));

		offset = end + end_tag.length;
	}

	if (offset < data.length) {
		blocks.push(data.slice(offset));
	}

	return blocks;
}

function Scope(data, resolver, options) {
	return {
		run: () => {
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
				case ":": // filter
					return "";
			}

			data = ("" + data).trim();

			if (data.substr(0, 8) == "include ") {
				var m = data.match(/^include\s+([^\s\()]+)(\s*\((.+)\))?$/);

				if (!m) return "throw new Error(\"Unknown include '" + escapeString(data) + "'\")";

				var filename = resolver(m[1]);
				var buf      = [];
				var fn;

				buf.push("__buf.push(((__compiler) => {");
				buf.push("var __buf=[],self = " + (m[3] && m[3].length ? m[3] : "{}") + ";");

				options.filename = filename;

				parse(readFile(filename, options.cache), options).map((block) => {
					if (typeof block.run == "function") {
						return buf.push(block.run());
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
		.replace(/\t/g, "\\t");
}
