var fs      = require("fs");
var path    = require("path");
var cache   = {};

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

	return (function () {
		var buf = [];
		var fn;

		buf.push("var buf=[];");
		buf.push("with(this){");

		parse(readFile(filename, options.cache), options).map((block) => {
			if (typeof block.run == "function") {
				return buf.push(block.run());
			}

			return buf.push("buf.push(\"" + escapeString(block.toString()) + "\");");
		});

		buf.push("}return buf.join(\"\")");

		fn = new Function("compiler", buf.join(""));

		return function (scope) {
			return fn.call(scope, {
				filters : exports.filters,
				escape  : exports.escape,
			});
		};
	})();
};

exports.render  = function (data, options) {
	options = options || {};

	return (function () {
		var buf = [];
		var fn;

		buf.push("var buf=[];");
		buf.push("with(this){");

		parse(data, options).map((block) => {
			if (typeof block.run == "function") {
				return buf.push(block.run());
			}

			return buf.push("buf.push(\"" + escapeString(block.toString()) + "\");");
		});

		buf.push("}return buf.join(\"\")");

		fn = new Function("compiler", buf.join(""));

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
						return "buf.push(compiler.escape(" + data.substr(2).trim().split(" | ").reduce((js, filter) => {
							return "compiler.filters." + filter.trim() + "(" + js + ")";
						}) + "));";
					}
					return "buf.push(compiler.escape(" + data.substr(1).trim() + "));";
				case "-": // raw data
					if (data[1] == ":") {
						// filter
						return "buf.push(" + data.substr(2).trim().split(" | ").reduce((js, filter) => {
							return "compiler.filters." + filter.trim() + "(" + js + ")";
						}) + ");";
					}
					return "buf.push(" + data.substr(1).trim() + ");";
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

				buf.push("buf.push(((compiler) => {var buf=[];");
				buf.push("var self = " + (m[3] && m[3].length ? m[3] : "{}") + ";");

				options.filename = filename;

				parse(readFile(filename, options.cache), options).map((block) => {
					if (typeof block.run == "function") {
						return buf.push(block.run());
					}

					return buf.push("buf.push(\"" + escapeString(block.toString()) + "\");");
				});

				buf.push("return buf.join(\"\")})(compiler));");

				return buf.join("");
			}

			return data + "\n";
		}
	};
};

function readFile(filename, do_cache) {
	if (!do_cache || !cache.hasOwnProperty(filename)) {
		cache[filename] = fs.readFileSync(filename);
	}

	return cache[filename];
}

function escapeString(js) {
	return String(js)
		.replace(/\\/g, "\\\\")
		.replace(/\"/g, "\\\"")
		.replace(/\n/g, "\\n")
		.replace(/\t/g, "\\t");
}
