import os
os.chdir('scratch/code-hearing')
for f in ['infix.js', 'question.js']:
    s = open(f).read()
    old = '    const b = v("lo", l) - 1;\n'
    new = '    const b = v("lo", l) - 1;\n    // Something still to its left that belongs to it ("a.b" before "a" is taken): not whole yet.\n    if (v("operandEnd", b)) return api.call("List", ...out);\n'
    assert old in s
    s = s.replace(old, new)
    open(f, 'w').write(s)
f = 'opener.js'
s = open(f).read()
old = '    const b = l >= 0 ? v("lo", l) - 1 : -1;\n'
new = '    const b = l >= 0 ? v("lo", l) - 1 : -1;\n    if (v("operandEnd", b)) return api.call("List", ...out);\n'
assert old in s
s = s.replace(old, new)
open(f, 'w').write(s)
