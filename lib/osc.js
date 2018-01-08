module.exports = (function() {

    var Struct = require('./struct.js');

    var TInt = function (value) { this.value = value; };
    TInt.prototype = {
        typetag: 'i',
        decode: function (data) {
            if (data.length < 4) {
                throw new ShortBuffer('int', data, 4);
            }

            this.value = Struct.Unpack('>i', data.slice(0, 4))[0];
            return data.slice(4);
        },
        encode: function () {
            var tempArray = new Array(4);
            return Struct.PackTo('>i', tempArray, 0, [this.value]);
        }
    };

    var TFloat = function (value) { this.value = value; };
    TFloat.prototype = {
        typetag: 'f',
        decode: function (data) {
            if (data.length < 4) {
                throw new ShortBuffer('float', data, 4);
            }

            this.value = Struct.Unpack('>f', data.slice(0, 4))[0];
            return data.slice(4);
        },
        encode: function () {
            var tempArray = new Array(4);
            return Struct.PackTo('>f', tempArray, 0, [this.value]);
        }
    };

    var TString = function (value) { this.value = value; };
    TString.prototype = {
        typetag: 's',
        decode: function (data) {
            var end = 0;
            while (data[end] && end < data.length) {
                end++;
            }
            if (end == data.length) {
                throw Error("OSC string not null terminated");
            }

            this.value = String.fromCharCode.apply(null, data.slice(0, end));

            var nextData = parseInt(Math.ceil((end + 1) / 4.0) * 4, 10);
            return data.slice(nextData);
        },
        encode: function () {
            var len = Math.ceil((this.value.length + 1) / 4.0, 10) * 4;
            var tempBuf = new Array(len);
            return Struct.PackTo('>' + len + 's', tempBuf, 0, [this.value]);
        }
    };

    var Message = function () {
        var args = arguments[0];

        this.address = args[0];
        this.typetags = '';
        this.args = [];

        for (var i = 1; i < args.length; i++) {
            var arg = args[i];
            switch (typeof arg) {
                case 'object':
                    if (arg.typetag) {
                        this.typetags += arg.typetag;
                        this.args.push(arg);
                    } else {
                        throw new Error("don't know how to encode object " + arg);
                    }
                    break;
                case 'number':
                    if (Math.floor(arg) == arg) {
                        this.typetags += TInt.prototype.typetag;
                        this.args.push(new TInt(Math.floor(arg)));
                    } else {
                        this.typetags += TFloat.prototype.typetag;
                        this.args.push(new TFloat(arg));
                    }
                    break;
                case 'string':
                    this.typetags += TString.prototype.typetag;
                    this.args.push(new TString(arg));
                    break;
                default:
                    throw new Error("don't know how to encode " + arg);
            }
        }
    };

    Message.prototype = {
        toBinary: function () {
            var address = new TString(this.address);
            var binary = [];
            var tempArray = [];
            tempArray = address.encode();
            binary = binary.concat(tempArray);
            if (this.typetags) {
                var typetags = new TString(',' + this.typetags);
                tempArray = typetags.encode();
                binary = binary.concat(tempArray);
                for (var i = 0; i < this.args.length; i++) {
                    tempArray = this.args[i].encode();
                    binary = binary.concat(tempArray);
                }
            }
            return binary;
        }
    };

    return {
        getMessage: function() {
            var msg = new Message(arguments);
            return new Buffer(msg.toBinary());
        }
    }

})();
