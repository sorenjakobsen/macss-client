module.exports = (function () {

    function getDefaults(issa) {
        return {
            's' : [0, 0],
            'r' : [0, 0],
            'v' : [0, 0],
            'o' : [0, issa ? 1 : 0],
            'p' : [0, 0],
            'c' : [0, 0],
            'l' : [0, 0],
            'h' : [0, 0],
            't' : [0, 0]
        }
    }

    function check(lineno, line, regex) {
        if (!regex.test(line)) {
            throw 'Syntax error line ' + (lineno + 1);
        }
    }

    function parseLine(cur, i, s) {
        switch (cur.code) {
            case 'i':
                if (cur.name.charCodeAt(0) > 64 && cur.name.charCodeAt(0) < 91) { //A-Z
                    check(i, s, /^\d+ \d+ [a-z0-9]+ ((\.|\d+) )+$/);
                    var b = s.split(' ');
                    return {
                        tempo: parseInt(b[0], 10),
                        beats: parseInt(b[1], 10),
                        samplepack: b[2],
                        divisions: b.slice(3).filter(function (x) {
                            return x.length != 0;
                        }).map(function (x) {
                            return x == '.' ? -1 : parseInt(x, 10);
                        })
                    }
                    break;
                } else {
                    check(i, s, /^([a-z][a-z]?[a-z]? )+$/);
                    return s.match(/[a-z][a-z]?[a-z]?/g).map(function (x) {
                        var a = [x.charAt(0)];
                        if (x.charAt(1)) a.push(x.charAt(1));
                        if (x.charAt(2)) a.push(x.charAt(2));
                        return a;
                    });
                }
            case 's':
                if (cur.isnumeric) {
                    check(i, s, /^(([0-9]{1,5}|\.) ){9}$/); //check number of numbers
                    return s.match(/([0-9]{1,5}|\.) /g).map(function (x) {
                        return x == '. ' ? 1.0 : parseFloat('0.' + x);
                    });
                } else {
                    check(i, s, /^([srvopclht] (\.[0-9]{0,5}|[0-9][0-9]?) )+$/);
                    return s.match(/[srvopclht] (\.[0-9]{0,5}|[0-9][0-9]?) /g).reduce(function (x, y) {
                        var c = y.split(' ');
                        if (c[1].charAt(0) == '.') {
                            x[c[0]] = [c[1].length == 1 ? 1.0 : parseFloat('0' + c[1]), 1];
                        } else {
                            x[c[0]] = [parseInt(c[1], 10), 0];
                        }
                        return x;
                    }, getDefaults(true))
                }
            case 'p':
                if (cur.isnumeric) {
                    check(i, s, /^[1-9 ]+$/);
                    return s.match(/[1-9]/g).map(function (x) {
                        return parseInt(x, 10);
                    });
                } else {
                    check(i, s, /^([srvopclht] [0-9][0-9]? ([0-9][0-9]? )?)+$/);
                    return s.match(/[srvopclht] [0-9][0-9]? ([0-9][0-9]?)?/g).reduce(function (x, y) {
                        var c = y.split(' ');
                        x[c[0]][0] = parseInt(c[1], 10);
                        x[c[0]][1] = c[2] ? parseInt(c[2], 10) : x[c[0]][0];
                        return x;
                    }, getDefaults(false))
                }
        }
        return [];
    }

    function validate(score) {
        var n = 0;
        for (var i = 65; i < 91; i++) { //A-Z
            var q = score.i[String.fromCharCode(i)];
            if (q && q.divisions.length > n) {
                n = q.divisions.length;
            }
        }
        for (var i = 97; i < 123; i++) { //a-z
            var k = String.fromCharCode(i);
            var q = score.i[k];
            if (q && q.length < n) {
                throw 'i' + k + ': must configure ' + n + ' voices.';
            }
        }
        for (var i = 48; i < 58; i++) { //0-9
            var k = String.fromCharCode(i);
            var q = score.i[k];
            if (q && q.length < n) {
                throw 'i' + k + ': must configure ' + n + ' voices.';
            }
        }
    }

    return {

        parse: function (text) {
            var result = { i: {}, p: {}, s: {} };
            var cur;
            var a = text.split('\n');
            for (var i = 0; i < a.length; i++) {
                var s = (a[i] + ' ').replace(/\t/g, ' ').replace(/\r/g, '').replace(/ +/g, ' ');
                if (s.indexOf('-') != -1) {
                    s = s.substring(0, s.indexOf('-'));
                }
                if (s == '' || s == ' ') continue;
                check(i, s, /^(i[A-Z]|[isp][a-z]|i[0-9]|[sp][0-9][0-9]?)? .*$/);
                if (s.charAt(0) == ' ') {
                    if (['i', 's'].includes(cur.code) || !cur.isnumeric) { //only non-numeric 'p' can have variations
                        throw 'Syntax error in line ' + (i + 1);
                    }
                    result[cur.code][cur.name].push(parseLine(cur, i, s.substring(1)));
                } else {
                    cur = { code: s.charAt(0), name: s.substring(1, s.indexOf(' ')), isnumeric: /^[0-9]$/.test(s.charAt(1)) };
                    if (['i', 's', 'p'].includes(cur.code) && result[cur.code][cur.name] !== undefined) {
                        throw 'Duplicate define in line ' + (i + 1);
                    }
                    var line = s.substring(2 + cur.name.length);
                    switch (cur.code) {
                        case 'i':
                            if (cur.name == 'Q') {
                                check(i, line, /^\d+ \d+ [a-z0-9]+ ((\.|\d+) )+$/);
                                var b = line.split(' ');
                                result.g = {
                                    tempo: parseInt(b[0], 10),
                                    beats: parseInt(b[1], 10),
                                    samplepack: b[2],
                                    divisions: b.slice(3).filter(function (x) {
                                        return x.length != 0;
                                    }).map(function (x) {
                                        return x == '.' ? -1 : parseInt(x, 10);
                                    })
                                }
                            }
                            result[cur.code][cur.name] = parseLine(cur, i, line);
                            break;
                        case 's':
                            result[cur.code][cur.name] = parseLine(cur, i, line);
                            break;
                        case 'p':
                            if (cur.isnumeric) {
                                result[cur.code][cur.name] = [parseLine(cur, i, line)];
                            } else {
                                result[cur.code][cur.name] = parseLine(cur, i, line);
                            }
                            break;
                    }
                }
            }
            if (!result.i['1']) result.i['1'] = result.g.divisions.map(function() { return ['a']; });
            if (!result.p['a']) result.p['a'] = getDefaults(false);
            if (!result.p['0']) result.p['0'] = [[5]];
            if (!result.i['q']) result.i['q'] = result.g.divisions.map(function() { return ['a']; });
            if (!result.s['a']) result.s['a'] = getDefaults(true);
            if (!result.s['0']) result.s['0'] = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

            validate(result);

            return result;
        }
    }
})();
