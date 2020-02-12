const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const request = require('request');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto('https://schedule.sxsw.com/2020/films');
  const urls = await page.evaluate(()=>{
    var events = document.getElementsByClassName('row single-event');
    var urls = [];
    for(var i=0;i<events.length;i++){
        urls.push(events[i].getElementsByTagName('div')[0].getElementsByTagName('a')[0].href);
    }
    return urls
  });
  await Promise.all(urls.map(async (url) => {
    request(url,(error,response,html) => {
        if(!error && response.statusCode == 200){
            const $ = cheerio.load(html);
            // If it is a screening URL 
            if($('h3.uppercase').text().includes('Screening')){
                let screening = {};
                // get screening dates and venues
                $('div.event-sidebar').find('div.related-event > div.small-10').each((idx,el)=>{
                    let tmp = {};
                    tmp['Date'] = $(el).find('div.date').text();
                    tmp['Time'] = $(el).find('div.time').text();
                    let venues = [];
                    $(el).find('div.event-details > a').each((idx,elem)=>{
                        venues.push($(elem).text());
                    });
                    tmp['Venues'] = venues;
                    screening['Film Screenings'] = tmp;
                });
                // get tags
                let tags = [];
                $('.event-tags').find('a.tag').each((idx,el)=>{
                    tags.push($(el).text());
                });
                screening['Tags'] = tags;
                // get director
                
                $('div.screening-info > div.large-8 > div.body > div.credits').each((idx,el)=>{
                    // Automatically populate a dictionary with fields if Credits 
                    // is the header for that section
                    if($(el).find('h3.uppercase').text().includes('Credits')){
                        $(el).find('.row').each((i,elem)=>{
                            screening[$(elem).find('b').text().replace('&nbsp;','')] = $(elem).text().replace($(elem).find('b').text(),'');
                        });
                    // If the header is Contact do the same as well
                    // these are treated different to locate them responsively and Credit fields have &nbsp; at the end
                    }else if($(el).find('h3.uppercase').text().includes('Contact')){
                        $(el).find('.row').each((i,elem)=>{
                        
                            var t = $(elem).contents().map(function() {
                                if (this.name=='b'|| this.type=='br'){
                                    return ''
                                }else if(this.type=='text'){
                                    return this.data+', '
                                }else if(this.type=='a'){
                                    return this.children.data
                                }
                            }).get().join(' ');
                            console.log(t);
                            
                            screening[$(elem).find('b').text()] = $(elem).text().replace($(elem).find('b').text(),'');
                        });
                    }
                });
            };
        }
    });
  }));

  await browser.close();
})();