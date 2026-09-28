// @realization WeatherNow(Rest($x)), context = Speaking(), evaluateArguments = false
// "In Tokyo, Japan it's 25.4°C and partly cloudy, with wind at 12 km/h."
async (args, bindings, api) => {
  const p = args.filter((a) => a.name === undefined).map((a) => a.value);
  return "In " + p[0] + " it's " + p[1] + p[2] + (p[3] ? " and " + p[3] : "") + ", with wind at " + p[4] + " " + p[5] + ".";
};
