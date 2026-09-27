// "x--" and "--x".
return api.call(named("after") ? "PostDecrement" : "PreDecrement", await read(parts[0]));
