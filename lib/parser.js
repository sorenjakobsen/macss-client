module.exports = (function () {

    function check(lineno, line, regex) {
        if (!regex.test(line)) {
            throw 'Syntax error line ' + (lineno + 1);
        }
    }

    function isint(str) {
        return /^[0-9]+$/.test(str);
    }

    function validate(s) {
        for (var i = 0; i < 26; i++) {
            var m = s[String.fromCharCode(i + 97)];
            if (!m) continue;
            for(var j = 0; j < m.variations.length; j++) {
                switch (m.type) {
                    case '*':
                        var f = function(p) {
                            var obj = m.variations[j][p];
                            var s = typeof obj.start == 'string';
                            var p = typeof obj.porta == 'string';
                            return `${(s ? 1 : 0)} ${s ? obj.start.charCodeAt(0) - 97 : obj.start} ${(p ? 1 : 0)} ${p ? obj.porta.charCodeAt(0) - 97 : obj.porta}`
                        }
                        this.sendParams(`f ${300+i}${j} 0 -20 -2   ${f('v')}   ${f('r')}   ${f('s')}   ${f('o')}   ${f('p')}`);
                        break;
                    case '%':
                        var f = function(p) {
                            var val = m.variations[j][p];
                            var s = typeof val == 'string';
                            return `${(s ? 1 : 0)} ${s ? val.charCodeAt(0) - 97 : val}`
                        }
                        this.sendParams(`f ${300+i}${j} 0 -10 -2   ${f('v')}   ${f('r')}   ${f('s')}   ${f('o')}   ${f('p')}`);
                        break;
                    case '+': case '-':
                        this.sendParams(`f ${300+i}${j} 0 -${m.variations[j].length} -2   ${m.variations[j].join(' ')}`);
                        break;
                }
            }
        }
    }

    function parsePart(type, name, i, s) {
        switch (type) {
            case '.':
                switch(name) {
                    case '0':
                        check(i, s, /^(\d+ ){1,10}$/);
                        var b = s.split(' ');
                        return {
                            tempo: parseInt(b[0], 10),
                            beats: parseInt(b[1], 10),
                            divisions: b.slice(2).filter(function (x) {
                                return x.length != 0;
                            }).map(function (x) {
                                return parseInt(x, 10);
                            })
                        }
                        break;
                    case '1': case '2':
                        check(i, s, /^[a-z]+ $/);
                        return s.match(/[a-z]/g);
                }
            case '*':
                check(i, s, /^([vrsop]([a-z]|[1-9])([a-z]|[1-9]) )+$/);
                return s.match(/[vrsop]([a-z]|[1-9])([a-z]|[1-9])/g).reduce(function (x, y) {
                    x[y.charAt(0)].start = isint(y.charAt(1)) ? parseInt(y.charAt(1), 10) : y.charAt(1);
                    x[y.charAt(0)].porta = isint(y.charAt(2)) ? parseInt(y.charAt(2), 10) : y.charAt(2);
                    return x;
                }, {
                    'v' : { start: 5, porta: 5},
                    'r' : { start: 5, porta: 5},
                    's' : { start: 5, porta: 1},
                    'o' : { start: 1, porta: 1},
                    'p' : { start: 5, porta: 5},
                });
            case '%':
                check(i, s, /^([vrsop]([a-z]|[0-9]{1,5}|\.) )+$/);
                return s.match(/[vrsop]([a-z]|[0-9]{1,5}|\.)/g).reduce(function (x, y) {
                    x[y.charAt(0)] = y.charAt(1) == '.' ? 1.0 :
                        (isint(y.charAt(1)) ? parseFloat('0.' + y.substring(1)) :  y.charAt(1));
                    return x;
                }, {
                    'v' : 0.5,
                    'r' : 0.5,
                    's' : 0.5,
                    'o' : 0.0,
                    'p' : 0.5,
                });
            case '+':
                check(i, s, /^[1-9 ]+$/);
                return s.match(/[1-9]/g).map(function (x) {
                    return parseInt(x, 10);
                });
            case '-':
                check(i, s, /^(([0-9]{1,5}|\.) ){9}$/);
                return s.match(/([0-9]{1,5}|\.) /g).map(function (x) {
                    return x == '. ' ? 1.0 : parseFloat('0.' + x);
                });
        }
        return [];
    }

    return {

        parse: function (text) {
            var result = {};
            var a = text.split('\n');
            for (var i = 0; i < a.length; i++) {
                var s = (' ' + a[i] + ' ').replace(/\t/g, ' ').replace(/\r/g, '').replace(/ +/g, ' ');
                if (s.indexOf('!') != -1) {
                    s = s.substring(0, s.indexOf('!'));
                }
                if (s == '' || s == ' ') continue;
                check(i, s, /^ ([0-2]|[a-z] [*%+-]) .*$/);
                var name = s.substring(1, 2);
                var type = isint(name) ? '.' : s.substring(3, 4);
                if (result[name]) {
                    throw 'Duplicate define in line ' + (i + 1);
                }
                result[name] = {
                    type: type,
                    variations: []
                }
                var parts = s.substring(isint(name) ? 2 : 4).split('/');
                for (var j = 0; j < parts.length; j++) {
                    result[name].variations.push(parsePart(type, name, i, parts[j].trim() + ' '));
                }
            }

            return result;
        }
    }
})();
