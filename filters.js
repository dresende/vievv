exports.first = (obj) => (obj[0]);
exports.last  = (obj) => (obj[obj.length - 1]);

exports.downcase   = (str) => (String(str).toLowerCase());
exports.upcase     = (str) => (String(str).toUpperCase());
exports.capitalize = (str) => {
	str = String(str);

	return str[0].toUpperCase() + str.substr(1, str.length);
};

exports.sort    = (obj)       => (Object.create(obj).sort());
exports.sort_by = (obj, prop) => (Object.create(obj).sort((a, b) => {
	a = a[prop], b = b[prop];

	if (a > b) return 1;
	if (a < b) return -1;
	return 0;
}));

exports.size = exports.length = (obj) => (obj.length);

exports.plus       = (a, b)     => (Number(a) + Number(b));
exports.minus      = (a, b)     => (Number(a) - Number(b));
exports.times      = (a, b)     => (Number(a) * Number(b));
exports.divided_by = (a, b)     => (Number(a) / Number(b));
exports.join       = (obj, str) => (obj.join(str || ', '));

exports.truncate   = (str, len, append) => {
	str = String(str);

	if (str.length > len) {
		str = str.slice(0, len);
		if (append) str += append;
	}

	return str;
};

exports.replace        = (str, pattern, substitution) => (String(str).replace(pattern, substitution || ""));
exports.truncate_words = (str, n)    => (String(str).split(/ +/).slice(0, n).join(' '));
exports.prepend        = (obj, val)  => (Array.isArray(obj) ? [val].concat(obj) : val + obj);
exports.append         = (obj, val)  => (Array.isArray(obj) ?  obj.concat(val)  : obj + val);
exports.map            = (arr, prop) => (arr.map((obj) => (obj[prop])));
exports.reverse        = (obj)       => (Array.isArray(obj) ? obj.reverse() : String(obj).split("").reverse().join(""));
exports.get            = (obj, prop) => (obj[prop]);
exports.json           = (obj)       => (JSON.stringify(obj));
