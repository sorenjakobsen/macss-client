module.exports = (function () {

    function check(lineno, line, regex) {
        if (!regex.test(line)) {
            throw 'Syntax error line ' + (lineno + 1);
        }
    }

    function isInt(str) {
        return /^[0-9]+$/.test(str);
    }

    function getDefaultPreset() {
        return {
            metric: null,
            animation: null,
            scales: null,
            config: {}
        };
    }

    function getDefaultRoot(type) {
        var t = type == ':' ? '*' : '%';
        return [ t, t, t, t, t, t, t, t, t, t ];
    }

    function getDefaultAnimation(obj) {
        if (obj) return { v: { start: obj.v.start, porta: obj.v.porta }, r: { start: obj.r.start, porta: obj.r.porta },
            s: { start: obj.s.start, porta: obj.s.porta }, o: { start: obj.o.start, porta: obj.o.porta }, p: { start: obj.p.start, porta: obj.p.porta } };
        return { v: { start: 5, porta: null }, r: { start: 5, porta: null }, s: { start: 1, porta: null }, o: { start: 1, porta: null }, p: { start: 5, porta: null } };
    }

    function getDefaultScales(obj) {
        if (obj) return { v: obj.v, r: obj.r, s: obj.s, o: obj.o, p: obj.p };
        return { v: '-', r: '-', s: '-', o: '-', p: '-' };
    }

    function parsePart(type, name, i, s, j, score) {
        switch (type) {
            case '.':
                s = s.replace(/ +/g, '');
                var regex = /^([a-z]{0,3})(([a-z][1-2][1-9]?[1-9]?){0,26})$/;
                check(i, s, regex);
                var x = regex.exec(s);
                var obj = getDefaultPreset();
                obj.metric = x[1].charAt(0);
                obj.animation = x[1].charAt(1);
                obj.scales = x[1].charAt(2);
                var matches = s.match(/[a-z][1-2][1-9]?[1-9]?/g) || [];
                return matches.reduce(function (x, y) {
                    x.config[y.charAt(0)] = [parseInt(y.charAt(1), 10) -1, y.length < 3 ? null : parseInt(y.charAt(2), 10),
                        y.length < 4 ? null : parseInt(y.charAt(3), 10)];
                    return x;
                }, obj);
            case '#':
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
            case ':': case ';':
                check(i, s, /^[a-z]+ $/);
                var d = getDefaultRoot(type);
                var v = s.match(/[a-z]/g);
                for (var i = 0; i < v.length; i++) {
                    d[i] = v[i];
                }
                return d;
            case '*':
                check(i, s, /^([vrsop]([a-z]|[1-9])([a-z]|[1-9])? )+$/);
                return s.match(/[vrsop]([a-z]|[1-9])([a-z]|[1-9])?/g).reduce(function (x, y) {
                    x[y.charAt(0)].start = isInt(y.charAt(1)) ? parseInt(y.charAt(1), 10) : y.charAt(1);
                    if (y.length > 2) {
                        x[y.charAt(0)].porta = isInt(y.charAt(2)) ? parseInt(y.charAt(2), 10) : y.charAt(2);
                    }
                    return x;
                }, getDefaultAnimation(j > 0 ? score[name].variations[0] : null));
            case '%':
                check(i, s, /^([vrsop]([a-z]|[0-9]{1,5}|\.) )+$/);
                var base = j > 0 ? score[name].variations[0] : getDefaultScales();
                return s.match(/[vrsop]([a-z]|[0-9]{1,5}|\.)/g).reduce(function (x, y) {
                    x[y.charAt(0)] = y.charAt(1) == '.' ? 1.0 :
                        (isInt(y.charAt(1)) ? parseFloat('0.' + y.substring(1)) :  y.charAt(1));
                    return x;
                }, getDefaultScales(j > 0 ? score[name].variations[0] : null));
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
            var score = {};
            score['#'] = { type: '#', variations: [ { tempo: 120, beats: 4, divisions: [16, 16, 16, 16, 16, 16, 16, 16, 16, 16] } ] };
            score[':'] = { type: ':', variations: [ getDefaultRoot(':') ] };
            score[';'] = { type: ';', variations: [ getDefaultRoot(';') ] };
            score['*'] = { type: '*', variations: [ getDefaultAnimation() ] };
            score['%'] = { type: '%', variations: [ getDefaultScales() ] };
            score['-'] = { type: '-', variations: [ [0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] ] };
            var a = text.split('\n');
            for (var i = 0; i < a.length; i++) {
                var s = (' ' + a[i] + ' ').replace(/\t/g, ' ').replace(/\r/g, '').replace(/ +/g, ' ');
                if (s.indexOf('!') != -1) {
                    s = s.substring(0, s.indexOf('!'));
                }
                if (s == '' || s == ' ') continue;
                check(i, s, /^ ([0-9]|[a-z] [#:;*%+-]) .*$/);
                var name = s.substring(1, 2);
                var type = isInt(name) ? '.' : s.substring(3, 4);
                if (score[name]) {
                    throw 'Duplicate define in line ' + (i + 1);
                }
                score[name] = { type: type, variations: [] };
                var parts = s.substring(isInt(name) ? 2 : 4).split('/');
                if (parts.length > (isInt(name) ? 1 : 4)) {
                    throw 'Too many variations in line ' + (i + 1);
                }
                for (var j = 0; j < parts.length; j++) {
                    score[name].variations.push(parsePart(type, name, i, parts[j].trim() + ' ', j, score));
                }
            }
            return score;
        }
    }
})();
