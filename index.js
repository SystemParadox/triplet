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
    UnexpectedToken: 'Unexpected token: ',
    InvalidRegExp: 'Invalid regular expression',
    UnterminatedComment: 'Unterminated block comment',
    UnterminatedString: 'Unterminated string',
    UnterminatedRegExp: 'Invalid regular expression: missing /',
    UnterminatedBlock: 'Unterminated block: missing ',
    InvalidJSXIdentifier: 'Invalid JSX identifier',
    MissingJSXClosing: 'Missing closing tag for JSX element: ',
    WrongJSXClosingTag: 'Wrong closing tag for JSX element: ',
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

    function expect(str) {
        var startIndex = index;
        var x = 0;
        while (index < length) {
            var ch = source[index];
            if (ch == str[x]) {
                index++;
                x = index - startIndex;
                if (x >= str.length) {
                    return;
                }
            } else {
                throwError(Messages.UnexpectedToken + JSON.stringify(ch) + ' (expected: ' + JSON.stringify(str[x]) + ')');
            }
        }
        throwError(Messages.UnexpectedEOS + ': ' + str);
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

    function scanLineTerminator() {
        var ch = source[index];
        var raw = '';
        if (ch === '\r' && source[index + 1] === '\n') {
            raw += '\r';
            ++index;
        }
        raw += '\n';
        ++lineNumber;
        ++index;
        lineStart = index;
        return raw;
    }

    function skipComment() {
        var ch;
        var blockComment = false;
        var lineComment = false;
        var raw = '';

        while (index < length) {
            ch = source[index];

            if (lineComment) {
                if (isLineTerminator(ch)) {
                    lineComment = false;
                    raw += scanLineTerminator();
                } else {
                    raw += ch;
                    ++index;
                }
            } else if (blockComment) {
                if (isLineTerminator(ch)) {
                    raw += scanLineTerminator();
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

    function scanJSXIdentifier() {
        var ch;
        var value = '';
        while (index < length) {
            ch = source[index];
            if (ch == '.' || isIdentifierPart(ch)) {
                value += ch;
                index++;
            } else {
                break;
            }
        }
        if (! value) {
            throwError(Messages.InvalidJSXIdentifier);
        }
        return value;
    }

    function parseJSX() {
        var ch, name;

        ch = source[index++];
        assert(ch === '<', "JSX must start with a '<'");

        name = scanJSXIdentifier();

        var chunk = ch + name;
        var body = [];
        var inStart = true;
        var closed = false;

        while (index < length) {
            ch = source[index];

            if (ch == '{') {
                index++;
                if (chunk) {
                    body.push({
                        type: 'Chunk',
                        raw: chunk,
                    });
                    chunk = '';
                }
                body.push({
                    type: 'Block',
                    startCh: '{',
                    endCh: '}',
                    body: parseBody('}'),
                });
            } else if ((ch === '\'' || ch === '"') && inStart) {
                var startLine = lineNumber;
                var str = scanStringLiteral();
                if (chunk) {
                    body.push({
                        type: 'Chunk',
                        raw: chunk,
                    });
                    chunk = '';
                }
                body.push(str);
            } else if (ch == '>' && inStart) {
                inStart = false;
                chunk += ch;
                index++;
            } else if (ch == '/' && inStart) {
                // self-closing
                expect('/>');
                chunk += '/>';
                inStart = false;
                closed = true;
                break;
            } else if (ch == '<') {
                var ch2 = source[index + 1];
                if (ch2 == '/') {
                    // closing
                    index += 2;
                    var closeName = scanJSXIdentifier();
                    if (closeName != name) {
                        throwError(Messages.WrongJSXClosingTag + name);
                    }
                    expect('>');
                    chunk += '</' + name + '>';
                    closed = true;
                    break;
                } else {
                    // nested tag
                    if (chunk) {
                        body.push({
                            type: 'Chunk',
                            raw: chunk,
                        });
                        chunk = '';
                    }
                    body.push(parseJSX());
                }
            } else if (isLineTerminator(ch)) {
                chunk += scanLineTerminator();
            } else {
                chunk += ch;
                index++;
            }
        }
        if (chunk) {
            body.push({
                type: 'Chunk',
                raw: chunk,
            });
        }
        if (! closed) {
            throwError(Messages.MissingJSXClosing + name);
        }
        return {
            type: 'JSX',
            name: name,
            body: body,
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
            var c = null;
            if (chunk.length > 0) {
                c = chunk[chunk.length - 1];
                if ('(,=:[!&|?{};'.indexOf(c) > -1) {
                    return true;
                }
                return false;
            }

            if (body.length < 1) {
                return true;
            }

            var prev = body[body.length - 1];
            switch (prev.type) {
                case 'Chunk':
                    c = prev.raw[prev.raw.length - 1];
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
            } else if (ch === '<' && options.jsx) {
                if (allowRegex()) {
                    pushChunk(parseJSX());
                } else {
                    chunk += ch;
                    ++index;
                }
            } else {
                var keyword = false;
                if (isIdentifierPart(ch) && (index == 0 || ! isIdentifierPart(source[index - 1]))) {
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
                case 'JSX':
                    pushOutput(item.body);
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
        console.error('Usage: ');
        console.error('  triplet [input] [options]');
        console.error('Options:');
        console.error('  --filename [filename]  Set input filename (for use in error messages)');
        console.error('  --jsx                  Enable JSX support');
        console.error('  --version              Display version number');
        console.error('  --help                 Display help and usage');
    }

    var inFile = null;

    for (var i=2; i < args.length; i++) {
        if (args[i] === '--help') {
            help();
            return;
        } else if (args[i] === '--version') {
            console.log('triplet v' + require('./package.json').version);
            return;
        } else if (args[i] === '--filename') {
            if (! args[i+1]) {
                console.error('--filename requires one argument');
                return;
            }
            options.filename = args[i+1];
            i++;
        } else if (args[i] === '--jsx') {
            options.jsx = true;
        } else {
            inFile = args[i];
        }
    }

    if (inFile === null) {
        // stdin
        triplet(process.stdin, options).pipe(process.stdout);
    } else {
        var stream = fs.createReadStream(inFile);
        if (! options.filename) {
            options.filename = inFile;
        }
        triplet(stream, options).pipe(process.stdout);
    }
};
