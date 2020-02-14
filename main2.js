const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const request = require('request');
const rp = require('request-promise');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto('https://schedule.sxsw.com/2020/films');
  const urls = await page.evaluate(()=>{
    let events = document.getElementsByClassName('row single-event');
    let urls = [];
    for(var i=0;i<events.length;i++){
        urls.push(events[i].getElementsByTagName('div')[0].getElementsByTagName('a')[0].href);
    }
    return urls
  });
   const get_result = (urls) => 
   { return Promise.all(urls.map(async (url) => {
    // Options for request-promise function
    var options = {
        uri: url,
        transform: function (body) {
            return cheerio.load(body);
        }
    };
    // Map each url object to a Promise by using request-promise package
    let out = rp(options).then($=>{
        let screening = {};
        // If it is a screening URL 
        screening['Film Screenings'] = [];
        if ($('h3.uppercase').text().includes('Screening')) {
            screening['Title'] = $('h1.event-name').text();
            screening['Link'] = url
            // get screening dates and venues
            $('div.event-sidebar').find('div.related-event > div.small-10').each((idx, el) => {
                let tmp = {};
                // Add multiple dates
                tmp['Date'] = $(el).find('div.date').text();
                // add multiple time as well
                tmp['Time'] = $(el).find('div.time').text();
                let venues = [];
                $(el).find('div.event-details > a').each((idx, elem) => {
                    venues.push($(elem).text());
                });
                tmp['Venues'] = venues;
                // Add the individual screening to film screenings
                screening['Film Screenings'].push(tmp);
            });
            // get tags
            let tags = [];
            $('.event-tags').find('a.tag').each((idx, el) => {
                tags.push($(el).text());
            });
            screening['Tags'] = tags;
            // get director
            // Contact + Credits Info Section
            $('div.screening-info > div.large-8 > div.body > div.credits').each((idx, el) => {
                // Automatically populate a dictionary with fields if Credits 
                // is the header for that section
                if ($(el).find('h3.uppercase').text().includes('Credits')) {
                    $(el).find('.row').each((i, elem) => {
                        screening[$(elem).find('b').text().replace(':', '').trim()] = $(elem).text().replace($(elem).find('b').text(), '');
                    });
                    // If the header is Contact do the same as well
                    // these are treated different to locate them responsively and Credit fields have &nbsp; at the end
                }
                else if ($(el).find('h3.uppercase').text().includes('Contact')) {
                    $(el).find('.row').each((i, elem) => {
                        // Iterate through all the elements inside this div
                        // Do operations based on conditions, then return a text
                        var t = $(elem).contents().map(function () {
                            if (this.name == 'b' || this.type == 'br') {
                                return '';
                            }
                            else if (this.type == 'text') {
                                return this.data + ', ';
                            }
                            else if (this.name == 'a') {
                                return this.children.data;
                            }
                        }).get().join('');
                        screening[$(elem).find('b').text().trim()] = t;
                    });
                }
            });
            // Contact + Credits Info Section END
            // Entry + Movie Info Section
            $('div.screening-info > div.large-4 > div.row').each((idx, el) => {
                // Find b tags, get their text, replace : and trim just in case there are any spaces
                screening[$(el).find('b').text().replace(':', '').trim()] = $(el).text().replace($(el).find('b').text(), '');
            });
        
    }
    return screening
    }).catch(e=>{
        return 'URL can not be reached'
    })
    return await out 
    }))};

    // output to a json file
    const data = await get_result(urls).then(val =>{
        var json = JSON.parse();
        var data = JSON.stringify(json);
        var fs = require('fs');
        fs.writeFile("file.json", data);
    });
    console.log(data); 
     
  await browser.close();
})();