const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const request = require('request');
const rp = require('request-promise');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto('https://schedule.sxsw.com/2020/films');
  const film_urls = await page.evaluate(()=>{
    let events = document.getElementsByClassName('row single-event');
    let urls = [];
    for(var i=0;i<events.length;i++){
        urls.push(events[i].getElementsByTagName('div')[0].getElementsByTagName('a')[0].href);
    }
    return urls
  });

  await page.goto('https://schedule.sxsw.com/2020/events/type/showcase?days=all');
  const showcase_urls = await page.evaluate(()=>{
    let events = document.getElementsByClassName('row single-event');
    let urls = [];
    for(var i=0;i<events.length;i++){
        urls.push(events[i].getElementsByTagName('div')[0].getElementsByTagName('a')[0].href);
    }
    return urls
  });


  // Function below will be used for general scraping
  // Will return different data based on which url set is given
  
   const get_data = (urls) => 
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
        console.log(e)
        return 'URL can not be reached'
    })
    return await out 
    }))};

 // output to a json file
    const films_data = await get_data(film_urls).then((val) =>{
        var data = JSON.stringify(val);
        fs.writeFile('data.json', data, function(err, result) {
            if(err) console.log('error', err);
          });
    });


  await browser.close();
})();