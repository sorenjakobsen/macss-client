'use babel';

import dgram from "dgram";
import { Disposable, CompositeDisposable } from 'atom';
import { Directory } from 'atom';
import osc from "./osc";
import  parser from "./parser";

const port = 8000;
const sender = dgram.createSocket('udp4');
const defaults = { '#': 26, ':': 27, ';': 28, '*': 29, '%': 30, '-': 31 };

export default {

activate(state) {
    var self = this;
    var addEventListener = function(editor, name, handler) {
        var view = atom.views.getView(editor);
        view.addEventListener(name, handler);
        return new Disposable(function() {
            return editor.removeEventListener(name, handler);
        });
    };
    self.subscriptions = new CompositeDisposable();
    self.subscriptions.add(atom.commands.add('atom-workspace', {
        'macss:loadSamples': () => self.loadSamples(),
        'macss:loadScore': () => self.loadScore(),
        'macss:clearScore': () => self.clearScore()
    }));
    atom.workspace.observeTextEditors(function(editor) {
        editor.__root = { metric: null, animation: null, scales: null };
        editor.__ctrl = {};
        for (var i = 0; i < 26; i++) {
            editor.__ctrl[String.fromCharCode(i + 97)] = [0, 1, 1];
        }
        self.subscriptions.add(addEventListener(editor, 'keyup', function(event) {
            var c = event.keyCode;
            if (c >= 37 && c <= 40 && c == editor.__arrow) {
                editor.__arrow = null;
            }
        }));
        self.subscriptions.add(addEventListener(editor, 'keydown', function(event) {
            var c = event.keyCode;
            var k = String.fromCharCode(c + 32);
            if (editor.__isreadonly) {
                if (event.repeat) return;
                if (c >= 37 && c <= 40) {
                    editor.__arrow = c;
                } else if (c >= 48 && c <= 57) {
                    if (event.altKey && event.shiftKey) { // save preset
                        var values = (new Array(26)).fill(0).reduce(function(x, y, i) {
                            var k = String.fromCharCode(i + 97);
                            if (editor.__score[k] && editor.__ctrl[k]) {
                                x.push(`${k}${editor.__ctrl[k][0] + 1}${editor.__ctrl[k][1]}${editor.__ctrl[k][2]}`);
                            }
                            return x;
                        }, []);
                        var r = editor.__root;
                        var root = (r.metric || '') + (r.animation || '') + (r.scales || '');
                        var preset = String.fromCharCode(c) + ' ' + root + (root ? ' ' : '') + values.join(' ');
                        var exist = false;
                        var lines = editor.getText().split('\n');
                        for (var i = 0; i < lines.length; i++) {
                            var line = lines[i];
                            if (line.length > 2 && line.trim().charCodeAt(0) == c) {
                                exist = true;
                                break;
                            }
                        }
                        self.togglePerformance(false, editor);
                        if (exist) {
                            var range = [[i, 0], [i, 10000]];
                            editor.setTextInBufferRange(range, preset);
                        } else {
                            editor.setTextInBufferRange([[0, 0], [0, 0]], preset + '\n');
                        }
                        self.loadScore();
                    } else { // apply preset
                        var k = String.fromCharCode(c);
                        if (editor.__score[k]) {
                            var p = editor.__score[k].variations[0];
                            editor.__root = {
                                metric: p.metric || editor.__root.metric,
                                animation: p.animation || editor.__root.animation,
                                scales: p.scales || editor.__root.scales
                            };
                            for (var i = 0; i < 26; i++) {
                                var kk = String.fromCharCode(i + 97);
                                var config = editor.__score[k].variations[0].config[kk];
                                if (config) {
                                    for (var j = 0; j < 3; j++) {
                                        editor.__ctrl[kk][j] = config[j] === null ? editor.__ctrl[kk][j] : config[j];
                                    }
                                }
                            }
                            self.sendCtrl(editor);
                            self.setHighlights(editor);
                        }
                    }
                } else if (c >= 65 && c <= 90) { // change module config
                    var k = String.fromCharCode(c + 32);
                    if (editor.__score[k]) {
                        var len = editor.__score[k].variations.length;
                        var ctrl = editor.__ctrl[k];
                        if (editor.__arrow) { // interpolate
                            var idx = ctrl[0] == 0 ? 1 : 2;
                            if ((idx == 1 && len > 1) || (idx == 2 && len > 3)) {
                                var incr = editor.__arrow == 37 ? -5 : (editor.__arrow == 38 ? 1 : (editor.__arrow == 39 ? 5 : -1));
                                ctrl[idx] = ctrl[idx] + incr < 1 ? 1 :
                                    (ctrl[idx] + incr > 9 ? 9 : ctrl[idx] + incr);
                            }
                        } else { // switch
                            ctrl[0] = ctrl[0] == 0 && len > 2 ? 1 : 0;
                        }
                        self.sendCtrl(editor);
                        self.setHighlights(editor);
                    }
                }
                if (c == 8 || c == 27 || c == 32) {
                    self.togglePerformance(false, editor);
                }
            }
        }));
        self.subscriptions.add(addEventListener(editor, 'mousemove', function(event) {
            editor.__x = event.screenX;
            editor.__y = event.screenY;
            if(editor.__isreadonly && (Math.abs(editor.__x - editor.__xx) > 5 || Math.abs(editor.__y - editor.__yy) > 5)) {
                self.togglePerformance(false, editor);
            }
        }));
    });
},

deactivate() {
    if (this.statusbox != null) {
      this.statusbox.destroy();
    }
    return this.statusbox = null;
},

serialize() { },

setupStatusBar(statusbar) {
    this.status = document.createElement('SPAN');
    this.status.className = "macss-status"
    this.statusbox = statusbar.addLeftTile({item: this.status, priority: 100});
},

togglePerformance(on, editor) {
    var view = atom.views.getView(editor);
    var buffer = editor.getBuffer();
    if (on && !editor.__isreadonly) {
        editor.__isreadonly = true;
        editor.__xx = editor.__x;
        editor.__yy = editor.__y;
        editor.__transact = buffer.transact;
        editor.__applyChange = buffer.applyChange;
        view.classList.toggle('readonly', true);
        buffer.transact = function() {};
        buffer.applyChange = function() {};
    } else if (!on && editor.__isreadonly) {
        editor.__isreadonly = false;
        buffer.transact = editor.__transact;
        buffer.applyChange = editor.__applyChange;
        view.classList.toggle('readonly', false);
    }
},

clearScore() {
    this.sendTables('f 600 0 -1 -2 0');
    //this.sendTables('f 2000 0 -2 -2 120 1');
    var editor = atom.workspace.getActiveTextEditor();
    this.togglePerformance(false, editor);
},

loadSamples() {
    var files = {};
    this.getSamples().forEach(function(f) {
       if (f.isFile()) {
           var path = f.getPath();
           var n = this.getFileName(path);
           if (n.substring(n.lastIndexOf(".") + 1).toLowerCase() == 'wav') {
               if (!files[n.charAt(0)]) {
                   files[n.charAt(0)] = [];
               }
               files[n.charAt(0)].push(path);
           }
       }
   }.bind(this));
   for (var i = 0; i < 26; i++) {
       var k = String.fromCharCode(i + 97);
       var arr = files[k];
       var code = 100 + i;
       if (arr) {
           var score = `f ${code} 0 -1 -2 ${arr.length}`
           this.sendTables(score);
           arr.sort();
           for (var j = 0; j < arr.length; j++) {
               score = `f ${code}${j} 0 0 -1 "${arr[j].replace(/\\/g, '\\\\')}" 0 0 0`;
               this.sendTables(score);
           }
       } else {
           var score = `f ${code} 0 -1 -2 0`;
           this.sendTables(score);
       }
   }
},

loadScore() {
    var tables = [];
    var editor = atom.workspace.getActiveTextEditor();
    if (editor.__isreadonly) {
        return;
    }
    this.setStatus('');
    var score = this.getScore();
    if (!score) return;

    try {
        var err = function(error, message) {
            if (error) {
                throw message;
            }
        }
        var referr = function(error, name, ref) {
            if (error) {
                throw 'Reference error in module ' + name + ': ' + ref + '.';
            }
        }
        var pushmodule = function(i, name, score) {
            var m = score[name];
            if (!m) return;
            for(var j = 0; j < m.variations.length; j++) {
                var v = m.variations[j];
                switch (m.type) {
                    case '#':
                        tables.push(`f ${300+i}${j} 0 -${2 + v.divisions.length} -2 ${v.tempo} ${v.beats} ${v.divisions.join(' ')}`);
                        break;
                    case ':': case ';':
                        var type = m.type == ':' ? '*' : '%';
                        var values = v.map(function(x) {
                            referr(!score[x] || score[x].type != type, name, x);
                            return defaults[x] || x.charCodeAt(0) - 97;
                        }).join(' ');
                        tables.push(`f ${300+i}${j} 0 -${v.length} -2 ${values}`);
                        break;
                    case '*':
                        var ff = function(val) {
                            var ref = typeof val == 'string';
                            if (!ref) return  `0 ${val}`
                            referr(!score[val] || score[val].type != '+', name, val);
                            return `1 ${val.charCodeAt(0) - 97}`
                        }
                        var f = function(p) {
                            var obj = v[p];
                            return ff(obj.start) + ' ' + (obj.porta ? ff(obj.porta) : '0 -1');
                        }
                        tables.push(`f ${300+i}${j} 0 -20 -2   ${f('v')}   ${f('r')}   ${f('s')}   ${f('o')}   ${f('p')}`);
                        break;
                    case '%':
                        var f = function(p) {
                            var val = v[p];
                            var ref = typeof val == 'string';
                            if (!ref) return `0 ${val}`
                            referr(!score[val] || score[val].type != '-', name, val);
                            return `1 ${val == '-' ? defaults['-'] : val.charCodeAt(0) - 97}`
                        }
                        tables.push(`f ${300+i}${j} 0 -10 -2   ${f('v')}   ${f('r')}   ${f('s')}   ${f('o')}   ${f('p')}`);
                        break;
                    case '+': case '-':
                        tables.push(`f ${300+i}${j} 0 -${v.length} -2   ${v.join(' ')}`);
                        break;
                }
            }
        }

        for (var i = 0; i < 10; i++) {
            var m = score[i + ''];
            if (!m) continue;
            var m = m.variations[0];
            referr(m.metric && (!score[m.metric] || score[m.metric].type != '#'), i + '', m.metric);
            referr(m.animation && (!score[m.animation] || score[m.animation].type != ':'), i + '', m.animation);
            referr(m.scales && (!score[m.scales] || score[m.scales].type != ';'), i + '', m.scales);
        }
        for (var i = 0; i < 26; i++) {
            pushmodule(i, String.fromCharCode(i + 97), score);
        }
        pushmodule(defaults['#'], '#', score);
        pushmodule(defaults[':'], ':', score);
        pushmodule(defaults[';'], ';', score);
        pushmodule(defaults['*'], '*', score);
        pushmodule(defaults['%'], '%', score);
        pushmodule(defaults['-'], '-', score);

        editor.__score = score;
        this.togglePerformance(true, editor);
        this.sendTables(tables.join('\n'));
        this.sendCtrl(editor);
        this.sendTables('f 600 0 -1 -2 2');
        this.setHighlights(editor);
    }
    catch (e) {
        this.setStatus(e);
    }
},

getScore() {
    try {
        return parser.parse(atom.workspace.getActivePaneItem().getText());
    }
    catch (e) {
        this.setStatus(e);
    }
},

setStatus(msg) {
    this.status.title = msg;
    this.status.textContent = msg;
},

getCurrentFilePath() {
    return this.getDirPath(atom.workspace.getActivePaneItem().buffer.file.path);
},

getDirPath(filepath) {
    return filepath.substring(0, filepath.lastIndexOf("\\"));
},

getFileName(filepath) {
    return filepath.substring(filepath.lastIndexOf("\\") + 1);
},

getSamples() {
    return (new Directory(this.getCurrentFilePath() + '/audio/')).getEntriesSync().sort();
},

sendTables(score) {
    console.log(score);
    var msg = osc.getMessage('/macss/params', score);
    return sender.send(msg, 0, msg.length, port, "localhost");
},

removeHighLights(editor) {
    var markers = editor.findMarkers();
    for (var i = 0; i < markers.length; i++) {
        markers[i].destroy();
    }
},

sendCtrl(editor) {
    var score = editor.__score;
    var r = editor.__root;
    var f = function(k) {
        var c = editor.__ctrl[k];
        if (score[k]) {
            if (score[k].variations.length == 1) {
                c[0] = 0;
                c[1] = 1;
                c[2] = 1;
            } else if (score[k].variations.length == 3) {
                c[2] = 1;
            }
        }
        return c[0] + ' ' + ((c[1] - 1) / 8.0) + ' ' + ((c[2] - 1) / 8.0);
    }

    var values = (new Array(26)).fill(0).reduce(function(x, y, i) {
        x.push(f(String.fromCharCode(i + 97)));
        return x;
    }, []);
    this.sendTables(`f 500 0 -${values.length * 3 + 18} -2 ${values.join(' ')}   0 0 0  0 0 0  0 0 0  0 0 0  0 0 0  0 0 0`);

    var ff = function(k, type) {
        if (k) {
            return k.charCodeAt(0) - 97;
        }
        for (var i = 0; i < 26; i++) {
            var kk = String.fromCharCode(i + 97);
            if (score[kk] && score[kk].type == type) {
                k = kk;
                console.log(kk);
                break;
            }
        }
        return k ? k.charCodeAt(0) - 97 : defaults[type];
    }
    this.sendTables(`f 400 0 -3 -2 ${ff(r.metric, '#')} ${ff(r.animation, ':')} ${ff(r.scales, ';')}`);
},

setHighlights(editor) {
    var markers = editor.findMarkers();
    var setdecoration = function(i, offset, variation, css) {
        var start = variation == 0 ? offset : line.split('/', variation).join('/').length + 1;
        var end = line.split('/', variation + 1).join('/').length;
        var range = [[i, start], [i, end]];
        var marker = editor.markBufferRange(range, { invalidate: 'never' });
        editor.decorateMarker(marker, { type: 'highlight', class: 'macss-hightlight' + css });
    }
    this.removeHighLights(editor);
    var lines = editor.getText().split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var k = line.trim().substring(0, 1);
        if (k && line.indexOf('/') != -1 && editor.__score[k]) {
            var vars = editor.__score[k].variations.length;
            var index = editor.__ctrl[k][0] * 2;
            var fade = editor.__ctrl[k][ editor.__ctrl[k][0] == 0 ? 1 : 2 ];
            var offset = line.search(/\S/) + (k == '1' || k == '2' || k == '3' ? 2 : 4);
            if (fade < 9) setdecoration(i, offset, index + 0, fade < 5 ? 1 : 2);
            if (fade > 1) setdecoration(i, offset, index + 1, fade > 5 ? 1 : 2);
        }
    }
}

};
