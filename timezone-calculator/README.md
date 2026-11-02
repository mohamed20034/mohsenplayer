# Mohsen Time Zone Converter

A lightweight, responsive time-zone comparison tool that always compares a selected location with **Egypt (Africa/Cairo)**.

## Features

- Search by ZIP / postal code, city, or full address.
- Choose from multiple geocoding matches when a postal code or place name is ambiguous.
- Compare the current time in Egypt and the selected location.
- Show each location's current date, UTC offset, and IANA time-zone identifier.
- Display the current difference in hours and minutes, including whether the selected place is ahead of or behind Egypt.
- Refresh the clocks every second and account for daylight-saving changes using IANA time-zone rules.
- 12-hour and 24-hour display modes.
- No API key, build step, or framework required.

## Open the tool

After GitHub Pages finishes deploying, open:

https://mohamed20034.github.io/mohsenplayer/timezone-calculator/

## How it works

1. **Photon** converts the submitted ZIP code or address into location coordinates. The user chooses one of the matching results.
2. **Hourora** maps those coordinates to the nearest city in its time-zone dataset.
3. The app compares that IANA time zone with `Africa/Cairo` and keeps the two clocks in sync using the server's UTC timestamp and the browser's time-zone-aware `Intl.DateTimeFormat`.

## Accuracy note

Hourora's coordinate lookup uses the **nearest listed city** and does not model time-zone borders. A result near a time-zone boundary, or far from a listed city, may therefore be approximate. The interface shows the nearest city and approximate distance when supplied by the API. Verify critical travel, payroll, or scheduling decisions with an authoritative local source.

## Data sources and attribution

- Geocoding: [Photon by Komoot](https://github.com/komoot/photon), based on [OpenStreetMap](https://www.openstreetmap.org/copyright) data.
- Time-zone data and conversion: [Hourora Developer API](https://hourora.app/en/developers), based on the IANA Time Zone Database.
- This app sends the search text to Photon to find coordinates. Do not submit confidential addresses or personal information.

## Run locally

Open `index.html` in a modern browser, or serve this folder with any static web server. The browser needs an internet connection to call the APIs.

## License

The application code in this folder is provided under the MIT License. The geocoding and time-zone services remain subject to their respective terms and availability.
