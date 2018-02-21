module.exports = (function () {

    function check(lineno, line, regex) {
        if (!regex.test(line)) {
            throw 'Syntax error line ' + (lineno + 1);
        }
    }

    function isInt(str) {
        return /^[0-9]+$/.test(str);
    }

    function getDefaultMultiply(obj) {
        if (obj) return { v: { start: obj.v.start, porta: obj.v.porta }, r: { start: obj.r.start, porta: obj.r.porta },
            s: { start: obj.s.start, porta: obj.s.porta }, o: { start: obj.o.start, porta: obj.o.porta }, p: { start: obj.p.start, porta: obj.p.porta } };
        return { v: { start: 5, porta: 5 }, r: { start: 5, porta: 5 }, s: { start: 1, porta: 1 }, o: { start: 1, porta: 1 }, p: { start: 5, porta: 5 } };
    }

    function getDefaultDivide(obj) {
        if (obj) return { v: obj.v, r: obj.r, s: obj.s, o: obj.o, p: obj.p };
        return { v: '-', r: '-', s: '-', o: '-', p: '-' };
    }

    function parsePart(type, name, i, s, j, score) {
        switch (type) {
            case '.':
                switch(name) {
                    case '1':
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
                    case '2': case '3':
                        check(i, s, /^[a-z]+ $/);
                        return s.match(/[a-z]/g);
                }
            case '*':
                check(i, s, /^([vrsop]([a-z]|[1-9])([a-z]|[1-9]) )+$/);
                return s.match(/[vrsop]([a-z]|[1-9])([a-z]|[1-9])/g).reduce(function (x, y) {
                    x[y.charAt(0)].start = isInt(y.charAt(1)) ? parseInt(y.charAt(1), 10) : y.charAt(1);
                    x[y.charAt(0)].porta = isInt(y.charAt(2)) ? parseInt(y.charAt(2), 10) : y.charAt(2);
                    return x;
                }, getDefaultMultiply(j > 0 ? score[name].variations[0] : null));
            case '%':
                check(i, s, /^([vrsop]([a-z]|[0-9]{1,5}|\.) )+$/);
                var base = j > 0 ? score[name].variations[0] : getDefaultDivide();
                return s.match(/[vrsop]([a-z]|[0-9]{1,5}|\.)/g).reduce(function (x, y) {
                    x[y.charAt(0)] = y.charAt(1) == '.' ? 1.0 :
                        (isInt(y.charAt(1)) ? parseFloat('0.' + y.substring(1)) :  y.charAt(1));
                    return x;
                }, getDefaultDivide(j > 0 ? score[name].variations[0] : null));
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
            score['*'] = { type: '*', variations: [ getDefaultMultiply() ] };
            score['%'] = { type: '%', variations: [ getDefaultDivide() ] };
            score['-'] = { type: '-', variations: [ [0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] ] };
            var a = text.split('\n');
            for (var i = 0; i < a.length; i++) {
                var s = (' ' + a[i] + ' ').replace(/\t/g, ' ').replace(/\r/g, '').replace(/ +/g, ' ');
                if (s.indexOf('!') != -1) {
                    s = s.substring(0, s.indexOf('!'));
                }
                if (s == '' || s == ' ') continue;
                check(i, s, /^ ([1-3]|[a-z] [*%+-]) .*$/);
                var name = s.substring(1, 2);
                var type = isInt(name) ? '.' : s.substring(3, 4);
                if (score[name]) {
                    throw 'Duplicate define in line ' + (i + 1);
                }
                score[name] = { type: type, variations: [] };
                var parts = s.substring(isInt(name) ? 2 : 4).split('/');
                if (parts.length > 4) {
                    throw 'Too many variations in line ' + (i + 1);
                }
                for (var j = 0; j < parts.length; j++) {
                    score[name].variations.push(parsePart(type, name, i, parts[j].trim() + ' ', j, score));
                }
            }
            if (!score['1']) {
                throw "Module 0 not defined.";
            }
            var voicecount = 0;
            for(var i = 0; i < score['1'].variations.length; i++) {
                if (score['1'].variations[i].divisions.length > voicecount) {
                    voicecount = score['1'].variations[i].divisions.length;
                }
            }
            if (!score['2']) {
                score['2'] = { type: '.', variations: [ Array(voicecount).fill('*'), Array(voicecount).fill('*') ] };
            }
            if (!score['3']) {
                score['3'] = { type: '.', variations: [ Array(voicecount).fill('%'), Array(voicecount).fill('%') ] };
            }
            return score;
        }
    }
})();
