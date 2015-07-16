// `=` comes first so regex
x = /'''/

// `x` so divide
x = x /'''/'''

// `(` so regex
x = (/'''/)

x = 10 {/'''/}

do { /'''/ }

// `=` before the `()` so divide
x = (a) / '''foo'''

// needs to be divide since call
bar (true) /'/'

// divide
return 4 / 'foo'

// regex
return /foo/

// divide (ECMA example)
a = b
/hi/g.exec(c).map(d);

// regex
{}/'''/g

// divide
('a')/'''a'''/g

// `)` so actually have to look back all the way to `if` to see regex
if (true) /'''/

// regex
return /'''/

// should be divide, but we parse as regex
+{}/'''a'''/g
