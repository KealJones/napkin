// "x++" and "++x".
return api.call(named("after") ? "PostIncrement" : "PreIncrement", await read(parts[0]));
