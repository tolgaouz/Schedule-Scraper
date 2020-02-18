const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const rp = require('request-promise');
const fs = require('fs');
const fetch = require("node-fetch");
const pLimit = require('p-limit');

// Concurrency of 30 promise at once
const limit = pLimit(30);
const fav_limit = pLimit(10);
 
let day = parseInt(process.argv[2]);
  if(!(day>=13 && day<=22)){
    console.log('Day number out of range or invalid argument')
    return 
  }
day = String(day);

(async () => {
  console.log('Script initiating..')
  const browser = await puppeteer.launch({ args: [
    '--no-sandbox',
    '--headless',
    '--disable-gpu',
    '--window-size=1920x1080',
  ] });
  const page = await browser.newPage();
  const base_url = 'https://schedule.sxsw.com';
  await page.goto('https://schedule.sxsw.com/2020/03/'+day+'/events');
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

  console.log('Total of '+urls_data.length+' URLs will be scraped with 70 concurrent connections each time.')

  // A function to make API Requests to get Favorite Counts on individual events
  // OLD FUNCTION FOR GETTING FAV COUNTS
  const get_favs = async (event_url,event_type) => {
    if(event_type.includes('Session')){
      return new Promise( async(resolve,reject) => {
        let event_id = event_url.split('/')[event_url.split('/').length-1]
        let result =  fetch("https://schedule.sxsw.com/favorite/events/"+event_id+"/interested.json", {
        "credentials": "include",
        "headers": {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:73.0) Gecko/20100101 Firefox/73.0",
            "Accept": "*/*",
            "Accept-Language": "tr-TR,tr;q=0.8,en-US;q=0.5,en;q=0.3",
            "X-Requested-With": "XMLHttpRequest",
        },
        "method": "GET",
        "mode": "cors"
        // get the response text
        })
        result.then((response) => {
            try{
            response.json()
            }catch(err){
                resolve(-1)
            }
        })
        .then((json) => {
         if(json) resolve(json['total'])
        })
        .catch(err =>{
            console.log(err)
            console.log('wrong')
            reject(-1)
        })
        })}
    }
    // New function to get fav counts using headless browser
    const get_favs_pup = async (event) =>{
        if(event['Event Type'].includes('Session')){
            return new Promise( async(resolve,reject) => {
                let pg = await browser.newPage();
                await pg.goto(event['Link'])
                console.log(event['Link'])
                pg.waitForSelector('section > div.content > h3').then(async ()=>{
                    let favs = await pg.evaluate(()=>{
                        return document.getElementsByClassName('whos-interested')[0].getElementsByTagName('h3')[0].textContent;
                    })
                    var regExp = /\(([^)]+)\)/;
                    favs = favs.match(regExp)
                    event['Favorite Count'] = favs[1]
                    resolve(event)
                    await pg.close()
                }).catch(async (err)=>{
                    event['Favorite Count'] = 'Not Found'
                    resolve(event)
                    await pg.close()
                })
    })}else{
        return event
    }}

    const promiseProducer = async (url_data) => {
        console.log('Scraping ->'+url_data['URL'])
        // Options for request-promise function
        var options = {
            uri: url_data['URL'],
            transform: function (body) {
                return cheerio.load(body);
            }
        };
        // Map each url object to a Promise by using request-promise package
        let out = rp(options).then($=>{
            $.prototype.exists = function (selector) {
                return this.find(selector).length > 0;
            }
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
                    data[$(el).find('b').text().replace(':', '').trim()] = $(el).text().replace($(el).find('b').text(), '').trim();
                });
        // If the event is an exhibition
        }else if (url_data['Event Type'].includes('Exhibition')) {
            data['Title'] = $('h1.event-name').text();
            data['Link'] = url_data['URL'];
            data['Event Type'] = 'Exhibition';
            data['Venue'] = '';
            $('.venue-title').find('a').each((i,el)=>{data['Venue']+=$(el).text()+' '})
            data['Venue'] = data['Venue'].trim()
            data['Date'] = $('div.event-date').text().split('|')[0].trim();
            data['Time'] = $('div.event-date').text().split('|')[1].trim();
            data['Venue Size'] = $('div.venue-size').text().replace('Venue Size: ');
            data['Venue Address'] = $('div.venue-address').text();
            // get tags
            let tags = [];
            $('.event-tags').find('a.tag').each((idx, el) => {
                tags.push($(el).text());
            });
            data['Tags'] = tags;
            data['Description'] = $('.description').find('div.large-8').text();
            $('div.description > div.large-4').find('div.row').each((idx, el) => {
                data[$(el).find('b').text().replace(':', '').trim()] = $(el).text().replace($(el).find('b').text(), '').trim();
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
                tmp['Date'] = $(el).find('div.thumbnail').children('small').find('.date').text();
                tmp['Time'] = $(el).find('div.thumbnail').children('small').find('.time').text();
                data['People Favorited'].push(tmp);
            });
            // If the event is a session
        }else if (url_data['Event Type'].includes('Session') || url_data['Event Type'].includes('Special Event')) {
            data['Title'] = $('h1.event-name').text();
            data['Link'] = url_data['URL'];
            data['Event Type'] = 'Session';
            if(url_data['Event Type'].includes('Special Event')) data['Event Type'] = 'Special Event'
            data['Speakers'] = [];
            data['Date'] = $('div.event-date').text().split('|')[0].trim();
            data['Time'] = $('div.event-date').text().split('|')[1].trim();
            data['Venue'] = '';
            $('.venue-title').find('a').each((i,el)=>{data['Venue']+=$(el).text()+' '})
            data['Venue'] = data['Venue'].trim()
            data['Venue Size'] = $('div.venue-size').text().replace('Venue Size: ');
            data['Venue Address'] = $('div.venue-address').text();
            $('div.badge').each((idx,el)=>{
                let tmp = {};
                tmp['Link'] = base_url+$(el).children('a')[0].attribs['href'];
                tmp['Name'] = $(el).find('.detail-name').text();
                tmp['Detail'] = $(el).find('.detail-item').text();
                data['Speakers'].push(tmp);
            });
            // get tags
            let tags = [];
            $('.event-tags').find('a.tag').each((idx, el) => {
                tags.push($(el).text());
            });
            data['Tags'] = tags;
            // People also favorited part
            data['People Favorited'] = [];
            $('div.related-event').each((idx,el)=>{
                let tmp = {};
                // People also favorited links ar designed in this way
                // Title of the event + 'AT' + Venue
                let full_text = $(el).find('div.small-10 > div.row > div.event-details').text().split('at');
                let title = full_text[0];
                let venue = full_text[1];
                tmp['Title'] = title;
                tmp['Venue'] = venue;
                // Link of the specific event
                tmp['Link'] = base_url+$(el).find('div.small-10 > div.row > div.event-details > a')[0].attribs['href'];
                tmp['Date'] = $(el).find('div.thumbnail').children('small').find('.date').text();
                tmp['Time'] = $(el).find('div.thumbnail').children('small').find('.time').text();
                data['People Favorited'].push(tmp);
            });
        data['Description'] = $('.description').find('div.large-8').text();
        $('div.description').find('div.large-4').find('div.row').each((idx, el) => {
            data[$(el).find('b').text().replace(':', '').trim()] = $(el).text().replace($(el).find('b').text(), '').trim();
        });
        }else if(url_data['Event Type'].includes('Showcase')){
            data['Title'] = $('h1.artist-name').text();
            data['Link'] = url_data['URL'];
            data['Event Type'] = 'Showcase';
            data['Events Featuring'] = [];
            data['Description'] = $('article').find('div.large-8').text();
            $('article').find('div.large-4').find('div.row').each((idx,el)=>{
                data[$(el).find('b').text().replace(':', '').trim()] = $(el).text().replace($(el).find('b').text(), '').trim();
            })
            $('div.event-sidebar').find('div.related-event > div.small-10').each((idx, el) => {
                let tmp = {};
                // Add multiple dates
                tmp['Date'] = $(el).find('div.date').text();
                // add multiple time as well
                tmp['Time'] = $(el).find('div.time').text();
                tmp['Venue'] = $('div.event-details > a').text().split('at')[1];
                // Add the individual screening to film screenings
                data['Events Featuring'].push(tmp);
            }); 
        }else{
            data['Title'] = $('h1.event-name').text();
            data['Link'] = url_data['URL'];
            data['Event Type'] = 'Exhibition';
            data['Venue'] = '';
            $('.venue-title').find('a').each((i,el)=>{data['Venue']+=$(el).text()+' '})
            data['Venue'] = data['Venue'].trim()
            data['Date'] = $('div.event-date').text().split('|')[0].trim();
            data['Time'] = $('div.event-date').text().split('|')[1].trim();
            data['Venue Size'] = $('div.venue-size').text().replace('Venue Size: ');
            data['Venue Address'] = $('div.venue-address').text();
            // get tags
            let tags = [];
            $('.event-tags').find('a.tag').each((idx, el) => {
                tags.push($(el).text());
            });
            data['Tags'] = tags;
            data['Description'] = $('.description').find('div.large-8').text();
          
            $('div.description > div.large-4').find('div.row').each((idx, el) => {
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
                tmp['Date'] = $(el).find('div.thumbnail').children('small').find('.date').text();
                tmp['Time'] = $(el).find('div.thumbnail').children('small').find('.time').text();
                data['People Favorited'].push(tmp);
            });
        }
        return data    
    }).catch(e=>{
            console.log(e)
            return 'URL can not be reached'
        })
    return out  
    }

  // Function below will be used for general scraping
  // Will return different data based on which url set is given
   const get_data = urls_data.map(url_data =>{
    return limit(()=>promiseProducer(url_data));  
   })
   
 // add in favorite counts
 // stupid way of adding favorite counts,
 // TODO: add this 
    const data = await Promise.all(get_data)

    const get_result_pup = data.map( dt => {
        return fav_limit(()=>get_favs_pup(dt))
    })

    const result = await Promise.all(get_result_pup)

    var last = JSON.stringify(result);
    fs.writeFile(day+'-March.json', last, function(err, result) {
        if(err){console.log('error', err)}else{console.log('file created successfully.')};
        });


    /* OLD WAY OF GETTING FAVORITE COUNTS 
    const get_result = (data) => { 
        return Promise.all(data.map(async (dt) => {
            if(dt != 'URL can not be reached'){
                get_favs_2(dt['Link'],dt['Event Type']).then((resp)=>{
                    console.log('here is the reuslt after this')
                    console.log(resp)
                    if(resp) dt['Favorite Count'] = resp
                }).catch(err=>{
                    console.log('CATCH SECOND')
                    console.log(err)
                })
            }
            return dt
        }))
    }
    get_result(data).then(resp=>{
        console.log(resp)
        var data = JSON.stringify(resp);
        fs.writeFile(day+'-March.json', data, function(err, result) {
            if(err) console.log('error', err);
          });
    }).catch(err=>{
        console.log(err)
    })

    */

  await browser.close();
})();