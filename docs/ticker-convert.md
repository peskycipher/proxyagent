# Convert Prices Using Ticker

With this method, you can effortlessly convert prices between FIAT currencies and cryptocurrencies, or even between different cryptocurrencies, by specifying the ticker directly in the URL path. This makes the conversion process straightforward and easy to implement.

**Note:**
 * Prices are fetched every 5 minutes from CoinMarketCap.

**Method:** `GET`

**Path:** ```
https://api.cryptapi.io/{ticker}/convert/
```


## Parameters

### Path Parameters

- **`ticker`** (`string`) (required) - Example: `btc`: The `ticker` parameter in this API request refers to the unique identifier of the cryptocurrency to which you are making the request. It is included in the URL of the request and helps to specify the exact cryptocurrency that you want to retrieve data for. The ticker is typically a short code that uniquely identifies the cryptocurrency, or the token and it's network/blockchain. For example, `btc` is the ticker for Bitcoin, and `trc20/usdt` is the ticker for USDT over TRC-20. Having this in mind, a request for USDT over TRC-20 will look like this: `https://api.cryptapi.io/trc20/usdt/create/`. 

**Notes:** 
* You can find all our tickers in our [cryptocurrencies](https://cryptapi.io/cryptocurrencies/) page.

### Query Parameters

- **`value`** (`number`) (required) - Example: `1`: Value you wish to convert in the cryptocurrency/token of the ticker you are using.

- **`from`** (`string`) (required) - Example: `USD`: Specify the currency you wish to convert from, whether it is FIAT or cryptocurrency. Check our full list of supported [cryptocurrencies](https://cryptapi.io/cryptocurrencies/). FIAT currencies supported in this list are (if the FIAT currency you wish to use is not in this list, you may [contact us](https://cryptapi.io/contacts/) in order to add it to our service): 
- (USD) United States Dollar 
- (EUR) Euro 
- (GBP) Great Britain Pound 
- (CAD) Canadian Dollar 
- (JPY) Japanese Yen 
- (AED) UAE Dollar 
- (MYR) Malaysian Ringgit 
- (IDR) Indonesian Rupiah 
- (THB) Thai Baht 
- (CHF) Swiss Franc 
- (SGD) Singapore Dollar 
- (RUB) Russian Ruble 
- (ZAR) South African Rand 
- (TRY) Turkish Lira 
- (LKR) Sri Lankan Rupee 
- (RON) Romanian Leu 
- (BGN) Bulgarian Lev 
- (HUF) Hungarian Forint 
- (CZK) Czech Koruna 
- (PHP) Philippine Peso 
- (PLN) Poland Zloti 
- (UGX) Uganda Shillings 
- (MXN) Mexican Peso 
- (INR) Indian Rupee 
- (HKD) Hong Kong Dollar 
- (CNY) Chinese Yuan 
- (BRL) Brazilian Real 
- (DKK) Danish Krone 
- (TWD) New Taiwan Dollar 
- (AUD) Australian Dollar 
- (NGN) Nigerian Naira 
- (SEK) Swedish Krona 
- (NOK) Norwegian Krone 
- (UAH) Ukrainian Hryvnia 
- (VND) Vietnamese Dong

## Returns

Returns the converted value and the exchange rate.

- **`value_coin`** (`number`): Converted value for the selected currencies.

- **`exchange_rate`** (`number`): The exchange rate between the 2 currencies.

- **`status`** (`string`): Status of the request. Should be success if the request didn't fail.



## Example Response

```json
{
  "value_coin": "0.01",
  "exchange_rate": "47000",
  "status": "success"
}
```