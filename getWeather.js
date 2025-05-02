// getWeather.js
const axios = require('axios');

const API_KEY = process.env.WEATHER_API_KEY;
const CITY = 'Fukuoka,jp'; // ← 地域名。福岡以外にしたい場合は変更OK

async function getWeather() {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${CITY}&appid=${API_KEY}&units=metric&lang=ja`;

  try {
    const response = await axios.get(url);
    const data = response.data;
    const weather = data.weather[0].description;
    const tempMax = Math.round(data.main.temp_max);
    const tempMin = Math.round(data.main.temp_min);

    return {
      description: weather,
      tempMax,
      tempMin
    };
  } catch (err) {
    console.error('天気取得失敗:', err.message);
    return null;
  }
}

module.exports = getWeather;
