export interface Platform {
  id: string;
  name: string;
  logo: string;
}

export const PLATFORMS: Platform[] = [
  { id: "swiggy",           name: "Swiggy",           logo: "/platforms/swiggy.webp" },
  { id: "zomato",           name: "Zomato",           logo: "/platforms/zomato.webp" },
  { id: "zepto",            name: "Zepto",            logo: "/platforms/zepto.png" },
  { id: "swish",            name: "Swish",            logo: "/platforms/swish.jpg" },
  { id: "bigbasket",        name: "Big Basket",       logo: "/platforms/big_basket.png" },
  { id: "blinkit",          name: "Blinkit",           logo: "/platforms/blinkit.jpg" },
  { id: "amazon_now",       name: "Amazon Now",        logo: "/platforms/amazon.jpg" },
  { id: "flipkart_minutes", name: "Flipkart Minutes",  logo: "/platforms/flipkart.jpg" },
  { id: "uber",             name: "Uber",              logo: "/platforms/uber.png" },
  { id: "ola",              name: "Ola",               logo: "/platforms/ola.jpg" },
  { id: "rapido",           name: "Rapido",            logo: "/platforms/rapido.png" },
  { id: "district",         name: "District",         logo: "/platforms/district.webp" },
  { id: "bookmyshow",       name: "Book My Show",     logo: "/platforms/bookmyshow.webp"},
  { id: "others",           name: "Others",            logo: "/platforms/others.jpg" },
];
