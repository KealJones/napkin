// @realization Weather(Rest($where)), context = Execution(), evaluateArguments = false
// "The weather in Tokyo": the place said (the words of the phrase, "new york" as York(New())),
// found by Open-Meteo's geocoder, and the conditions there now. WeatherNow(place, temperature,
// unit, conditions, wind, wind unit, from = OpenMeteo(url)), or the call itself.
async (args, bindings, api) => {
  const isCall = (e) => e !== null && typeof e === "object" && "head" in e;
  let at = args.find((a) => a.name === undefined)?.value;
  if (isCall(at) && ["In", "At", "For"].includes(at.head) && at.args.length === 1) at = at.args[0].value;
  // A phrase heard as a word holding what describes it: its words, the describing ones first.
  const words = [];
  for (let e = at; isCall(e); e = e.args[0]?.value) {
    words.unshift(e.head.replace(/([a-z])([A-Z])/g, "$1 $2"));
    if (e.args.length !== 1) break;
  }
  const place = words.join(" ");
  if (!place) return api.call("Weather", ...args.map((a) => a.value));
  const geo = api.toHost(await api.evaluate(api.call("Fetch", "https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + encodeURIComponent(place))));
  const found = geo && Array.isArray(geo.results) ? geo.results[0] : undefined;
  if (!found) return api.call("Weather", ...args.map((a) => a.value));
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + found.latitude + "&longitude=" + found.longitude + "&current=temperature_2m,weather_code,wind_speed_10m";
  const now = api.toHost(await api.evaluate(api.call("Fetch", url)));
  const cur = now && now.current;
  if (!cur) return api.call("Weather", ...args.map((a) => a.value));
  // Open-Meteo's weather codes are WMO's (its documentation): the words for each.
  const code = Number(cur.weather_code);
  const WMO = [[0, "clear"], [1, "mainly clear"], [2, "partly cloudy"], [3, "overcast"], [45, "foggy"], [48, "foggy"], [51, "drizzling"], [56, "freezing drizzle"], [61, "raining"], [66, "freezing rain"], [71, "snowing"], [77, "snow grains"], [80, "rain showers"], [85, "snow showers"], [95, "thunderstorms"], [96, "thunderstorms with hail"]];
  const conditions = WMO.filter(([c]) => c <= code).pop()?.[1] ?? "";
  const name = found.name + (found.country ? ", " + found.country : "");
  return { head: "WeatherNow", args: [{ value: name }, { value: Number(cur.temperature_2m) }, { value: String(now.current_units?.temperature_2m ?? "") }, { value: conditions }, { value: Number(cur.wind_speed_10m) }, { value: String(now.current_units?.wind_speed_10m ?? "") }, { name: "from", value: api.call("OpenMeteo", url) }] };
};
