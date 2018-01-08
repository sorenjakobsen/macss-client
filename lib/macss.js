'use babel';

import dgram from "dgram";
import { CompositeDisposable } from 'atom';
import { Directory } from 'atom';
import osc from "./osc"
import  parser from "./parser";

const port = 8000
const sender = dgram.createSocket('udp4');

export default {

activate(state) {
    var self = this;
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(atom.commands.add('atom-workspace', {
        'macss:loadSamples': () => self.loadSamples(),
        'macss:loadScore': () => self.loadScore(),
        'macss:clearScore': () => self.clearScore(),
    }));
    atom.workspace.observeTextEditors(function(editor) {
        editor.onDidChangeCursorPosition(function(obj) {
            var markers = editor.findMarkers();
            for (var i = 0; i < markers.length; i++) {
                markers[i].destroy();
            }
            self.setHighlights(editor, obj, 'p');
            self.setHighlights(editor, obj, 's');
        });
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

loadSamples() {
   var iii = 0;
   this.getSampleDirs().forEach(function(dir) {
       if (dir.isDirectory()) {
           var files = {};
           dir.getEntriesSync().forEach(function(file) {
               if (file.isFile()) {
                   var path = file.getPath();
                   var filename = this.getFileName(path);
                   if (filename.substring(filename.lastIndexOf(".") + 1).toLowerCase() == 'wav') {
                       if (!files[filename.charAt(0)]) {
                           files[filename.charAt(0)] = [];
                       }
                       files[filename.charAt(0)].push(path);
                   }
               }
           }.bind(this));
           for (var i = 0; i < 26; i++) {
               var k = String.fromCharCode(i + 97);
               var arr = files[k];
               var code = '2' + ('0'+iii).slice(-2) + ('0'+i).slice(-2);
               if (arr) {
                   var score = `f ${code} 0 -1 -2 ${arr.length}` //('0'+i).slice(-2)
                   this.sendParams(score);
                   arr.sort();
                   for (var j = 0; j < arr.length; j++) {
                       score = `f ${code}${j} 0 0 -1 "${arr[j]}" 0 0 0`;
                       this.sendParams(score);
                   }
               } else {
                   var score = `f ${code} 0 -1 -2 0`;
                   this.sendParams(score);
               }
           }
           iii++;
       }
   }.bind(this));
},

loadScore() {
    this.setStatus(null);
    var s = this.getScore();
    if (!s) return;

    var isnumeric = function(str) {
        return /^[0-9]+$/.test(str)
    }

    console.log('[i 0 - 9]');
    var counts = '';
    for (var i = 0; i < 10; i++) {
        var k = "" + i;
        counts += (s.i[k] ? s.i[k].length : 0) + ' ';
        if (s.i[k]) {
            for (var j = 0; j < s.i[k].length; j++) {
                var values = s.i[k][j].map(function(x) { return x.charCodeAt(0) - 97 }).join(' ');
                this.sendParams(`f ${100+i}${j} 0 -${s.i[k][j].length} -2 ${values}`);
            }
        }
    }
    this.sendParams(`f ${100} 0 -10 -2 ${counts}`);

    console.log('[i A - Z]');
    var counts = '';
    var dirs = this.getSampleDirs();
    for (var i = 0; i < 26; i++) {
        var k = String.fromCharCode(i + 65);
        counts += (s.i[k] ? s.i[k].divisions.length : 0) + ' ';
        if (s.i[k]) {
            var values = s.i[k].divisions.map(function(x) { return x; }).join(' ');
            var index = dirs.findIndex(function(dir) { return dir.getBaseName() == s.i[k].samplepack; });
            this.sendParams(`f ${800+i} 0 -${3 + (s.i[k].divisions.length)} -2 ${s.i[k].tempo} ${s.i[k].beats} ${index} ${values}`);
        }
    }
    this.sendParams(`f ${800} 0 -26 -2 ${counts}`);

    console.log('[i a - z]');
    var counts = '';
    for (var i = 0; i < 26; i++) {
        var k = String.fromCharCode(i + 97);
        counts += (s.i[k] ? s.i[k].length : 0) + ' ';
        if (s.i[k]) {
            for (var j = 0; j < s.i[k].length; j++) {
                var values = s.i[k][j].map(function(x) { return x.charCodeAt(0) - 97 }).join(' ');
                this.sendParams(`f ${300+i}${j} 0 -${s.i[k][j].length} -2 ${values}`);
            }
        }
    }
    this.sendParams(`f ${300} 0 -26 -2 ${counts}`);

    console.log('[p 0 - 99]');
    Object.keys(s.p).filter(x => isnumeric(x)).forEach(function(k) {
        var i = parseInt(k);
        this.sendParams(`f ${500+i} 0 -1 -2 ${s.p[k].length}`);
        for (var j = 0; j < s.p[k].length; j++) {
            this.sendParams(`f ${500+i}${j} 0 -${s.p[k][j].length} -2 ${s.p[k][j].join(' ')}`);
        }
    }.bind(this));

    console.log('[p a - z]');
    Object.keys(s.p).filter(x => !isnumeric(x)).forEach(function(k) {
        var i = k.charCodeAt(0) - 97
        var ff = function(p) {
            return `${s.p[k][p][0]} ${s.p[k][p][1]}`
        }
        this.sendParams(`f ${400+i} 0 -18 -2  ${ff('s')}  ${ff('r')}  ${ff('v')}  ${ff('o')}  ${ff('p')}  ${ff('c')}  ${ff('l')}  ${ff('h')}  ${ff('t')}`);
    }.bind(this));

    console.log('[s 0 - 99]');
    Object.keys(s.s).filter(x => isnumeric(x)).forEach(function(k) {
        var i = parseInt(k);
        var values = s.s[k].join(' ');
        this.sendParams(`f ${700+i} 0 -${s.s[k].length} -2 ${values}`);
    }.bind(this));

    console.log('[s a - z]');
    Object.keys(s.s).filter(x => !isnumeric(x)).forEach(function(k) {
        var i = k.charCodeAt(0) - 97
        var ff = function(p) {
            return `${s.s[k][p][0] == -1 ? -1 : (s.s[k][p][1] ? s.s[k][p][0] : s.s[k][p][0])} ${s.s[k][p][1]}` ;
        }
        this.sendParams(`f ${600+i} 0 -18 -2  ${ff('s')}  ${ff('r')}  ${ff('v')}  ${ff('o')}  ${ff('p')}  ${ff('c')}  ${ff('l')}  ${ff('h')}  ${ff('t')}`);
    }.bind(this));
},

clearScore() {
    this.sendScore(0, "", 1, 1);
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

getSampleDirs() {
    return (new Directory(this.getCurrentFilePath() + '/audio/')).getEntriesSync().sort();
},

sendParams(score) {
    console.log(score);
    var msg = osc.getMessage('/macss/params', score);
    return sender.send(msg, 0, msg.length, port, "localhost");
},

sendScore(index, score, beatlen, scorelen) {
    console.log(score);
    var msg = osc.getMessage('/macss/score', score, index, beatlen, scorelen);
    return sender.send(msg, 0, msg.length, port, "localhost");
},

setHighlights(editor, obj, code) {
    var curline = editor.lineTextForBufferRow(obj.newBufferPosition.row);
    if (curline.length > 2 && curline.charAt(0) == code && /^[0-9]$/.test(curline.charAt(1))) {
        var name = curline.substring(1, curline.indexOf(' '));
        var regex = new RegExp('\\b' + name + '\\b', 'g');
        var lines = editor.getText().split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.length > 2 && line.charAt(0) == code && /^[a-z]$/.test(line.charAt(1))) {
                var range = [[i, 0], [i, 10000]];
                editor.scanInBufferRange(regex, range, function(obj) {
                    var isstatic = obj.match.input.charAt(obj.match.index - 1) == '.';
                    var iscomment = obj.match.input.indexOf('-') != -1 && obj.match.index > obj.match.input.indexOf('-');
                    if (!isstatic && !iscomment) {
                        var marker = editor.markBufferRange(obj.computedRange, { invalidate: 'never' });
                        editor.decorateMarker(marker, { type: 'highlight', class: 'macss-hightlight' });
                    }
                });
            }
        }
    }
}

};
