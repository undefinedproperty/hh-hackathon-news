let Parser = require('rss-parser');
let parser = new Parser();

export class RSSParser {
  async parse(link: string): Promise<any> {
    try {
      let feed = await parser.parseURL(link);
      console.log('Feed: ', feed);
      return feed;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
  
  async validate(
    link: string
  ): Promise<{
    isValid: boolean;
    metadata?: {
      feedUrl: string;
      title: string;
      description: string;
      link: string;
      author: string;
      categories: string[];
      pubDate: string;
      image: string;
      items: any[];
    };
  }> {
    try {
      const feed = await this.parse(link);
      
      if (!feed || !feed.items) {
        console.log('Invalid RSS feed: no items found');
        return { isValid: false };
      }
      
      const {
        feedUrl,
        title,
        description,
        link: feedLink,
        author,
        categories,
        pubDate,
        image,
        items,
      } = feed;
      
      return {
        isValid: true,
        metadata: {
          feedUrl,
          title,
          description,
          link: feedLink,
          author,
          categories,
          pubDate,
          image,
          items,
        },
      };
    } catch (error) {
      console.log('Invalid RSS link');
      console.error(error);
      return { isValid: false };
    }
  };
}

export default new RSSParser();
