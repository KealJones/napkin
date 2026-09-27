// @realization File($path), context = Execution(), evaluateArguments = false
// A file a message names, read from where Napkin was started (or "~/"): SourceCode, read as the
// code IR by the language its name says; text when no language reads it; Unreadable when it
// cannot be read.
async (args, bindings, api) => {
  const path = String(bindings.get("path"));
  const file = api.readFile(path);
  if (!file) return api.call("Unreadable", api.call("File", path));
  const ext = (/\.([A-Za-z0-9]+)$/.exec(path) ?? [])[1] ?? "";
  const LANGUAGE = { ts: "typescript", tsx: "typescript", js: "javascript", mjs: "javascript", jsx: "javascript", py: "python" };
  const read = LANGUAGE[ext.toLowerCase()] ? await api.readCode(file.text, LANGUAGE[ext.toLowerCase()]) : undefined;
  const args2 = [{ value: file.text }, { name: "file", value: path }];
  if (read) args2.push({ name: "language", value: api.call(read.language) }, { name: "ir", value: read.ir });
  return { head: "SourceCode", args: args2 };
};
