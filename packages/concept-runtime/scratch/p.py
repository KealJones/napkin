import os
os.chdir('scratch/code-hearing')
for f in ['infix.js', 'question.js', 'opener.js']:
    s = open(f).read()
    n = s.count('b >= 0 && (v("operator", b) || v("prefix", b))')
    s = s.replace('b >= 0 && (v("operator", b) || v("prefix", b))', 'b >= 0 && !(v("pair", b) > at) && (v("operator", b) || v("prefix", b))')
    open(f, 'w').write(s)
    print(f, n)
