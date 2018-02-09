'use babel';

import dgram from "dgram";
import { Disposable, CompositeDisposable } from 'atom';
import { Directory } from 'atom';
import osc from "./osc";
import  parser from "./parser";

const port = 8000;
const sender = dgram.createSocket('udp4');

const firstkeyrow = "qwertyuio";

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
        editor.__ctrl = {};
        self.subscriptions.add(addEventListener(editor, 'keydown', function(event) {
            var buffer = editor.getBuffer();
            var c = event.keyCode;
            var k = String.fromCharCode(c + 32);
            if (editor.__isreadonly) {
                if (event.repeat) return;
                if (event.shiftKey) {
                    if (c >= 49 && c <= 57) {
                        var val = (c - 49) / 8;
                        editor.__fade1 = val
                        self.sendControl(2, val);
                        self.setHighlights(editor);
                    } else {
                        var index = firstkeyrow.indexOf(String.fromCharCode(event.keyCode).toLowerCase());
                        if (index != -1) {
                            editor.__fade2 = index / 8;
                            self.sendControl(1, index / 8);
                            self.setHighlights(editor);
                        }
                    }
                }
                else {
                    if (c == 48 || (c >= 65 && c <= 90)) {
                        var k = String.fromCharCode(c + (c >= 65 ? 32 : 0));
                        if (editor.__score[k]) {
                            var x = editor.__ctrl[k] || 0;
                            var len = editor.__score[k].variations.length;
                            var val = (x + 1) % len;
                            editor.__ctrl[k] = val;
                            arr = [];
                            for (var i = 0; i < 26; i++) {
                                arr.push(editor.__ctrl[String.fromCharCode(i + 97)] || 0);
                            }
                            self.sendParams(`f 500 0 -30 -2 ${arr.join(' ')}  ${editor.__ctrl['0'] || 0} 0 0 0`);
                            self.setHighlights(editor);
                        }
                    }
                }
                if (c == 8 || c == 27 || c == 32 || (c >= 37 && c <= 40)) {
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
    this.sendParams('f 2000 0 -2 -2 120 1');
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
           this.sendParams(score);
           arr.sort();
           for (var j = 0; j < arr.length; j++) {
               score = `f ${code}${j} 0 0 -1 "${arr[j].replace(/\\/g, '\\\\')}" 0 0 0`;
               this.sendParams(score);
           }
       } else {
           var score = `f ${code} 0 -1 -2 0`;
           this.sendParams(score);
       }
   }
},

loadScore() {
    var params = [];
    var editor = atom.workspace.getActiveTextEditor();
    if (editor.__isreadonly) {
        return;
    }
    this.setStatus(null);
    var score = this.getScore();
    if (!score) return;

    try {
        var defaults = { '*': 27, '%': 28, '-': 29 };
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
                switch (m.type) {
                    case '*':
                        var ff = function(val) {
                            var ref = typeof val == 'string';
                            if (!ref) return  `0 ${val}`
                            referr(!score[val] || score[val].type != '+', name, val);
                            return `1 ${val.charCodeAt(0) - 97}`
                        }
                        var f = function(p) {
                            var obj = m.variations[j][p];
                            return ff(obj.start) + ' ' + ff(obj.porta);
                        }
                        params.push(`f ${300+i}${j} 0 -20 -2   ${f('v')}   ${f('r')}   ${f('s')}   ${f('o')}   ${f('p')}`);
                        break;
                    case '%':
                        var f = function(p) {
                            var val = m.variations[j][p];
                            var ref = typeof val == 'string';
                            if (!ref) return `0 ${val}`
                            referr(!score[val] || score[val].type != '-', name, val);
                            return `1 ${val == '-' ? defaults['-'] : val.charCodeAt(0) - 97}`
                        }
                        params.push(`f ${300+i}${j} 0 -10 -2   ${f('v')}   ${f('r')}   ${f('s')}   ${f('o')}   ${f('p')}`);
                        break;
                    case '+': case '-':
                        params.push(`f ${300+i}${j} 0 -${m.variations[j].length} -2   ${m.variations[j].join(' ')}`);
                        break;
                }
            }
        }

        err(score['1'].variations.length > 2, 'Error in module 1: number of variations must not exceed 2.');
        err(score['2'].variations.length > 2, 'Error in module 2: number of variations must not exceed 2.');

        var voicecount = 0;

        for(var i = 0; i < score['0'].variations.length; i++) {
            var v = score['0'].variations[i];
            if (v.divisions.length > voicecount) {
                voicecount = v.divisions.length;
            }
            params.push(`f ${200}${i} 0 -${2 + v.divisions.length} -2 ${v.tempo} ${v.beats} ${v.divisions.join(' ')}`);
        }

        err(voicecount > 8, 'Error in module 0: number of voices must not exceed 8.');

        for(var i = 0; i < score['1'].variations.length; i++) {
            var v = score['1'].variations[i];
            err(v.length < voicecount, 'Error in module 1: all voices must be specified.');
            var values = v.map(function(x) {
                referr(!score[x] || score[x].type != '*', name, x);
                return x == '*' ? defaults['*'] : x.charCodeAt(0) - 97;
            }).join(' ');
            params.push(`f ${201}${i} 0 -${v.length} -2 ${values}`);
        }
        for(var i = 0; i < score['2'].variations.length; i++) {
            var v = score['2'].variations[i];
            err(v.length < voicecount, 'Error in module 2: all voices must be specified.');
            var values = v.map(function(x) {
                referr(!score[x] || score[x].type != '%', name, x);
                return x == '%' ? defaults['%'] : x.charCodeAt(0) - 97;
            }).join(' ');
            params.push(`f ${202}${i} 0 -${v.length} -2 ${values}`);
        }

        for (var i = 0; i < 26; i++) {
            pushmodule(i, String.fromCharCode(i + 97), score);
        }
        pushmodule(defaults['*'], '*', score);
        pushmodule(defaults['%'], '%', score);
        pushmodule(defaults['-'], '-', score);

        editor.__score = score;
        this.togglePerformance(true, editor);
        this.setHighlights(editor);
        this.sendParams(params.join('\n'));
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

sendControl(param, value) {
    var msg = osc.getMessage('/macss/control', param, value);
    return sender.send(msg, 0, msg.length, port, "localhost");
},

sendParams(score) {
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
        if (k && line.indexOf('/') != -1) {
            var variation = editor.__ctrl[k] || 0;
            var isint = k == '0' || k == '1' || k == '2'
            var offset = line.search(/\S/) + (isint ? 2 : 4);
            if (k == '1' || k == '2') {
                var fade = editor['__fade' + k] || 0;
                if (fade < 1.0) setdecoration(i, offset, 0, fade < 0.5 ? 1 : 2);
                if (fade > 0.0) setdecoration(i, offset, 1, fade > 0.5 ? 1 : 2);
            } else {
                setdecoration(i, offset, variation, 1);
            }
        }
    }
}

};
