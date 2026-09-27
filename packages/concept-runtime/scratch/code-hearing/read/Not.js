// "!x" is not x; said after, "x!" only says x is there.
return named("after") ? read(parts[0]) : api.call("Not", await read(parts[0]));
