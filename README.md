## NodeJS Schedule Scraper Project for Upwork

## Warning: This is a project made on a request for a client on Upwork. Scrapes he event schedule of https://schedule.sxsw.com/2020/03/19/events for each day.

##  Usage

- Clone the repo
- Open up a terminal in the same directory
- run npm install to install packages
- node main.js {Event Day} to run the scraper 
- After a successful execution 'data.json' file should be outputted in same directory
- Also the script uses p-Limit package to restrict the number of concurrent promises to 30
- This can be changed by changing the line
 `const limit = pLimit(30);` -- > `const limit = pLimit({new limit});`

## Dependencies

- Cheerio
- Puppeteer
- Request-Promise
- pLimit


