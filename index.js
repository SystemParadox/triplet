var fs = require('fs');
var through2 = require('through2');
var Regex = require('./regex');

function assert(condition, message) {
    if (!condition) {
        throw new Error('ASSERT: ' + message);
    }
}

var Messages = {
    UnexpectedEOS: 'Unexpected end of input',
    InvalidRegExp: 'Invalid regular expression',
    UnterminatedComment: 'Unterminated block comment',
    UnterminatedString: 'Unterminated string',
    UnterminatedRegExp: 'Invalid regular expression: missing /',
    UnterminatedBlock: 'Unterminated block: missing ',
};

function parse(source, options) {
    options = options || {};

    var length = source.length;
    var index = 0;
    var lineNumber = 1;
    var lineStart = index;
    var filename = options.filename || '<stdin>';

    function throwError(msg) {
        var line = lineNumber;
        var column = index - lineStart + 1;
        var error = new Error(filename + ':' + line + ':' + column + ': error: ' + msg);
        error.index = index;
        error.lineNumber = lineNumber;
        error.column = column;

        throw error;
    }

    // 7.2 White Space

    function isWhiteSpace(ch) {
        return (ch === ' ') || (ch === '\u0009') || (ch === '\u000B') ||
            (ch === '\u000C') || (ch === '\u00A0') ||
            (ch.charCodeAt(0) >= 0x1680 &&
             '\u1680\u180E\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\uFEFF'.indexOf(ch) >= 0);
    }

    // 7.3 Line Terminators

    function isLineTerminator(ch) {
        return (ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029');
    }

    function isIdentifierPart(ch) {
        return (ch === '$') || (ch === '_') || (ch === '\\') ||
            (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
            ((ch >= '0') && (ch <= '9')) ||
            ((ch.charCodeAt(0) >= 0x80) && Regex.NonAsciiIdentifierPart.test(ch));
    }

    function isKeyword(id) {
        switch (id.length) {
        case 2:
            return (id === 'if') || (id === 'in') || (id === 'do');
        case 3:
            return (id === 'var') || (id === 'for') || (id === 'new') ||
                (id === 'try') || (id === 'let');
        case 4:
            return (id === 'this') || (id === 'else') || (id === 'case') ||
                (id === 'void') || (id === 'with') || (id === 'enum');
        case 5:
            return (id === 'while') || (id === 'break') || (id === 'catch') ||
                (id === 'throw') || (id === 'const') ||
                (id === 'class') || (id === 'super');
        case 6:
            return (id === 'return') || (id === 'typeof') || (id === 'delete') ||
                (id === 'switch') || (id === 'export') || (id === 'import');
        default:
            return false;
        }
    }

    function skipComment() {
        var ch;
        var blockComment = false;
        var lineComment = false;
        var raw = '';

        while (index < length) {
            ch = source[index];

            if (lineComment) {
                ch = source[index++];
                if (isLineTerminator(ch)) {
                    lineComment = false;
                    if (ch === '\r' && source[index] === '\n') {
                        ++index;
                        raw += '\r';
                    }
                    raw += '\n';
                    ++lineNumber;
                    lineStart = index;
                } else {
                    raw += ch;
                }
            } else if (blockComment) {
                if (isLineTerminator(ch)) {
                    if (ch === '\r' && source[index + 1] === '\n') {
                        raw += '\r';
                        ++index;
                    }
                    raw += '\n';
                    ++lineNumber;
                    ++index;
                    lineStart = index;
                    if (index >= length) {
                        throwError(Messages.UnterminatedComment);
                    }
                } else {
                    ch = source[index++];
                    if (index >= length) {
                        throwError(Messages.UnterminatedComment);
                    }
                    raw += ch;
                    if (ch === '*') {
                        ch = source[index];
                        if (ch === '/') {
                            blockComment = false;
                            ++index;
                            raw += '/';
                        }
                    }
                }
            } else if (ch === '/') {
                ch = source[index + 1];
                if (ch === '/') {
                    index += 2;
                    lineComment = true;
                    raw += '//';
                } else if (ch === '*') {
                    index += 2;
                    blockComment = true;
                    raw += '/*';
                    if (index >= length) {
                        throwError(Messages.UnterminatedComment);
                    }
                } else {
                    break;
                }
            } else if (isWhiteSpace(ch)) {
                ++index;
                raw += ch;
            } else if (isLineTerminator(ch)) {
                ++index;
                raw += ch;
                if (ch === '\r' && source[index] === '\n') {
                    raw += source[index];
                    ++index;
                }
                ++lineNumber;
                lineStart = index;
            } else {
                break;
            }
        }

        return raw;
    }

    // 7.8.4 String Literals
    function scanStringLiteral() {
        var str = '';
        var quote, start, ch;
        var triple = false;

        quote = source[index];
        var startQuote = quote;
        assert((quote === '\'' || quote === '"' || quote === '`'),
            'String literal must start with a quote');

        start = index;
        ++index;

        if (length > index + 2 && source[index] === quote && source[index+1] === quote) {
            triple = true;
            index += 2;
        }

        while (index < length) {
            ch = source[index++];

            if (ch === quote) {
                if (triple) {
                    if (source[index] === quote && source[index+1] === quote) {
                        quote = '';
                        index += 2;
                        break;
                    } else {
                        str += '\\' + ch;
                    }
                } else {
                    quote = '';
                    break;
                }
            } else if (ch === '\\') {
                ch = source[index++];
                if (!isLineTerminator(ch)) {
                    str += '\\' + ch;
                } else {
                    if (! triple) {
                        str += '\\' + ch;
                    }
                    ++lineNumber;
                    if (ch ===  '\r' && source[index] === '\n') {
                        if (! triple) {
                            str += '\n';
                        }
                        ++index;
                    }
                }
            } else if (isLineTerminator(ch)) {
                if (triple || quote == '`') {
                    ++lineNumber;
                    if (ch ===  '\r' && source[index] === '\n') {
                        if (! triple) {
                            str += '\r';
                        }
                        ++index;
                    }
                    str += '\n';
                } else {
                    break;
                }
            } else {
                str += ch;
            }
        }

        if (quote !== '') {
            throwError(Messages.UnterminatedString);
        }

        return {
            type: 'StringLiteral',
            value: str,
            triple: triple,
            quote: startQuote,
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [start, index]
        };
    }

    function scanRegExp() {
        var str, ch, start, pattern, flags, value, classMarker = false, terminated = false;

        start = index;
        ch = source[index];
        assert(ch === '/', 'Regular expression literal must start with a slash');
        str = source[index++];

        while (index < length) {
            ch = source[index++];
            str += ch;
            if (classMarker) {
                if (ch === ']') {
                    classMarker = false;
                }
            } else {
                if (ch === '\\') {
                    ch = source[index++];
                    // ECMA-262 7.8.5
                    if (isLineTerminator(ch)) {
                        throwError(Messages.UnterminatedRegExp);
                    }
                    str += ch;
                } else if (ch === '/') {
                    terminated = true;
                    break;
                } else if (ch === '[') {
                    classMarker = true;
                } else if (isLineTerminator(ch)) {
                    throwError(Messages.UnterminatedRegExp);
                }
            }
        }

        if (!terminated) {
            throwError(Messages.UnterminatedRegExp);
        }

        // Exclude leading and trailing slash.
        pattern = str.substr(1, str.length - 2);

        flags = '';
        while (index < length) {
            ch = source[index];
            if (!isIdentifierPart(ch)) {
                break;
            }

            ++index;
            flags += ch;
            str += ch;
        }

        try {
            value = new RegExp(pattern, flags);
        } catch (e) {
            throwError(Messages.InvalidRegExp);
        }

        return {
            type: 'RegexLiteral',
            literal: str,
            value: value,
            range: [start, index]
        };
    }

    function scanKeyword() {
        var id = '';

        var start = index;
        var ch;

        while (index < length) {
            ch = source[index];
            if (!isIdentifierPart(ch)) {
                break;
            }
            id += ch;
            index++;
        }
        if (! isKeyword(id)) {
            index = start;
            return null;
        }

        return {
            type: 'Keyword',
            value: id,
        };
    }

    var last = '';

    function parseBody(end) {
        var leadingComments = '';
        var chunk = '';
        var body = [];

        function pushChunk(x) {
            if (chunk.length > 0) {
                var cc = {
                    type: 'Chunk',
                    raw: chunk,
                };
                chunk = '';
                pushChunk(cc);
            }
            if (x) {
                if (leadingComments) {
                    x.leadingComments = leadingComments;
                    leadingComments = '';
                }
                body.push(x);
            }
        }

        // lookback
        function allowRegex() {
            if (body.length < 1) {
                return true;
            }
            var prev = body[body.length - 1];
            switch (prev.type) {
                case 'Chunk':
                    var c = prev.raw[prev.raw.length - 1];
                    if ('(,=:[!&|?{};'.indexOf(c) > -1) {
                        return true;
                    }
                    return false;
                case 'Block':
                    if (prev.endCh == '}') {
                        return true;
                    }
                    if (prev.endCh == ')') {
                        if (body.length < 2) {
                            return false;
                        }
                        var prev2 = body[body.length - 2];
                        if (prev2.type == 'Keyword' && prev2.value == 'if') {
                            return true;
                        }
                    }
                    return false;
                case 'Keyword':
                    return (prev.value != 'this');
                default:
                    return false;
            }
        }

        var ch;
        while (index < length) {
            ch = source[index];
            var comment = skipComment();
            if (comment) {
                if (chunk.length > 0) {
                    pushChunk(null);
                    leadingComments = comment;
                } else {
                    leadingComments += comment;
                }
                continue;
            }
            if (ch === end) {
                last = ch;
                index++;
                break;
            }
            if (ch === '\'' || ch === '"' || ch === '`') {
                var startLine = lineNumber;
                var str = scanStringLiteral();
                if (str.triple && str.quote != '`') {
                    while (startLine < lineNumber) {
                        chunk += '\n';
                        startLine++;
                    }
                }
                pushChunk(str);
            } else if (ch === '(') {
                ++index;
                last = ch;
                pushChunk({
                    type: 'Block',
                    startCh: ch,
                    endCh: ')',
                    body: parseBody(')'),
                });
            } else if (ch === '{') {
                ++index;
                last = ch;
                pushChunk({
                    type: 'Block',
                    startCh: ch,
                    endCh: '}',
                    body: parseBody('}'),
                });
            } else if (ch === '[') {
                ++index;
                last = ch;
                pushChunk({
                    type: 'Block',
                    startCh: ch,
                    endCh: ']',
                    body: parseBody(']'),
                });
            } else if (ch === '/') {
                if (allowRegex()) {
                    var regex = scanRegExp();
                    pushChunk(regex);
                } else {
                    chunk += ch;
                    ++index;
                }
            } else {
                var keyword = false;
                if (isIdentifierPart(ch)) {
                    keyword = scanKeyword();
                }
                if (keyword) {
                    pushChunk(keyword);
                } else {
                    last = ch;
                    chunk += ch;
                    ++index;
                }
            }
        }
        if (end) {
            if (ch !== end) {
                throwError(Messages.UnterminatedBlock + end);
            }
            pushChunk(null);
            if (leadingComments) {
                pushChunk({
                    type: 'Chunk',
                    raw: '',
                    leadingComments: leadingComments,
                });
            }
        } else {
            pushChunk({
                type: 'EOF',
            });
        }
        return body;
    }
    return parseBody(null);
}

function transform(source, options) {
    function postProcess(item) {
        var str = item.value;
        var ch = item.quote;
        var indent = -1;
        if (str.length < 1) {
            return ch + ch;
        }
        if (! item.triple) {
            return ch + str + ch;
        }

        if (str[0] === '\n') {
            str = str.substr(1);
        }
        // Remove whitespace following final newline
        str = str.replace(/\n *$/, '\n');

        var lines = str.split('\n');
        for (var i=0; i < lines.length; i++) {
            var j = 0;
            var line = lines[i];
            for (j=0; j < line.length; j++) {
                var c = line[j];
                if (c != ' ') {
                    if (indent < 0 || j < indent) {
                        indent = j;
                    }
                    break;
                }
            }
        }

        if (indent > 0) {
            for (i=0; i < lines.length; i++) {
                lines[i] = lines[i].substr(indent);
            }
        }

        if (ch === '`') {
            str = lines.join('\n');
        } else {
            str = lines.join('\\n');
        }

        return ch + str + ch;
    }

    //console.warn('input', source);
    var ast = parse(source, options);
    //console.warn('ast', util.inspect(ast, {depth: 20, colors: true}));
    var output = '';
    function pushOutput(body) {
        for (var i=0; i < body.length; i++) {
            var item = body[i];
            if (item.leadingComments) {
                output += item.leadingComments;
            }
            switch (item.type) {
                case 'Chunk':
                    output += item.raw;
                    break;
                case 'Keyword':
                    output += item.value;
                    break;
                case 'Block':
                    output += item.startCh;
                    pushOutput(item.body);
                    output += item.endCh;
                    break;
                case 'StringLiteral':
                    output += postProcess(item);
                    break;
                case 'RegexLiteral':
                    output += item.literal;
                    break;
                case 'EOF':
                    break;
                default:
                    throw new Error('unknown type: ' + item.type);
            }
        }
    }
    pushOutput(ast);
    return output;
}

function triplet(source, options) {
    options = options || {};

    if (Buffer.isBuffer(source)) {
        source = String(source);
    }

    if (source.pipe) {
        // assume a stream
        var bufs = [];
        var stream = through2(function (chunk, enc, cb) {
            bufs.push(chunk);
            cb();
        }, function (cb) {
            source = String(Buffer.concat(bufs));
            var output = transform(source, options);
            this.push(output);
            cb();
        });
        source.pipe(stream);
        return stream;
    }

    return transform(source, options);
}

exports = module.exports = triplet;
exports.parse = parse;

exports.cli = function cli(args) {
    var options = {};

    function help() {
        console.error('Usage: triplet [input] [options]');
    }

    if (args[2] === '--help') {
        help();
        return;
    }
    if (args.length === 2) {
        // stdin
        triplet(process.stdin, options).pipe(process.stdout);
    } else if (args.length === 3) {
        var stream = fs.createReadStream(args[2]);
        triplet(stream, options).pipe(process.stdout);
    } else {
        help();
    }
};
