const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const request = require('request');
const rp = require('request-promise');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const base_url = 'https://schedule.sxsw.com';

  await page.goto('https://schedule.sxsw.com/2020/03/13/events');
  const urls_data = await page.evaluate(()=>{
    let events = document.getElementsByClassName('row single-event');
    let data = [];
    for(var i=0;i<events.length;i++){
        let tmp = {};
        tmp['URL'] = events[i].getElementsByTagName('div')[0].getElementsByTagName('a')[0].href;
        tmp['Date'] = events[i].childNodes[1].getElementsByClassName('text-center')[0].textContent;
        tmp['Event Type'] = events[i].childNodes[3].textContent;
        data.push(tmp);
    }
    return data
  });

  // Function below will be used for general scraping
  // Will return different data based on which url set is given
  
   const get_data = (urls_data) => 
   { return Promise.all(urls_data.map(async (url_data) => {
    // Options for request-promise function
    var options = {
        uri: url_data['URL'],
        transform: function (body) {
            return cheerio.load(body);
        }
    };
    // Map each url object to a Promise by using request-promise package
    let out = rp(options).then($=>{
        let data = {};
        // If it is a screening URL 
        if (url_data['Event Type'].includes('Screening')) {
            data['Film Screenings'] = [];
            data['Title'] = $('h1.event-name').text();
            data['Link'] = url_data['URL'];
            data['Event Type'] = 'Screening';
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
                data['Film Screenings'].push(tmp);
            });
            // get tags
            let tags = [];
            $('.event-tags').find('a.tag').each((idx, el) => {
                tags.push($(el).text());
            });
            data['Tags'] = tags;
            // get director
            // Contact + Credits Info Section
            $('div.screening-info > div.large-8 > div.body > div.credits').each((idx, el) => {
                // Automatically populate a dictionary with fields if Credits 
                // is the header for that section
                if ($(el).find('h3.uppercase').text().includes('Credits')) {
                    $(el).find('.row').each((i, elem) => {
                        data[$(elem).find('b').text().replace(':', '').trim()] = $(elem).text().replace($(elem).find('b').text(), '');
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
                        data[$(elem).find('b').text().trim()] = t;
                    });
                }
            });
            // Contact + Credits Info Section END
            // Entry + Movie Info Section
            $('div.screening-info > div.large-4 > div.row').each((idx, el) => {
                // Find b tags, get their text, replace : and trim just in case there are any spaces
                data[$(el).find('b').text().replace(':', '').trim()] = $(el).text().replace($(el).find('b').text(), '');
            });
    // If the event is an exhibition
    }else if (url_data['Event Type'].includes('Exhibition')) {
        data['Title'] = $('h1.event-name').text();
        data['Link'] = url_data['URL'];
        data['Event Type'] = 'Exhibition';
        data['Venue'] = $('.venue-title').text();
        data['Date'] = $('div.event-date').text();
        data['Venue Size'] = $('div.venue-size').text();
        data['Venue Address'] = $('div.venue-address').text();
        // get tags
        let tags = [];
        $('.event-tags').find('a.tag').each((idx, el) => {
            tags.push($(el).text());
        });
        data['Tags'] = tags;
        data['Description'] = $('div.row description').find('div.large-8').text();
        $('div.row description > div.large-4 > div.row').each((idx, el) => {
            data[$(el).find('b').text().replace(':', '').trim()] = $(el).text().replace($(el).find('b').text(), '');
        });
        // People also favorited part
        data['People Favorited'] = [];
        $('div.related-event').each((idx,el)=>{
            let tmp = {};
            // People also favorited links ar designed in this way
            // Title of the event + 'AT' + Venue
            let full_text = $(el).find('div.small-10 > div.row > div.event-details').text().split('AT');
            let title = full_text[0];
            let venue = full_text[1];
            tmp['Title'] = title;
            tmp['Venue'] = venue;
            // Link of the specific event
            tmp['Link'] = base_url+$(el).find('div.small-10 > div.row > div.event-details > a')[0].attribs['href'];
            tmp['Date'] = $(el).find('div.small-10 > div.row > div.thumbnail > small > div.date').text();
            tmp['Time'] = $(el).find('div.small-10 > div.row > div.thumbnail > small > div.time').text();
            data['People Favorited'].push(tmp);
        });
    }
    return data
    }).catch(e=>{
        console.log(e)
        return 'URL can not be reached'
    })
    return await out 
    }))};

 // output to a json file
    const films_data = await get_data(urls_data).then((val) =>{
        var data = JSON.stringify(val);
        fs.writeFile('data.json', data, function(err, result) {
            if(err) console.log('error', err);
          });
    });


  await browser.close();
})();