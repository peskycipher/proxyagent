# Estimate Blockchain Fees

This method allows you to estimate blockchain fees to forward a transaction to your wallet address.

**Notes:**
  * This is an **estimation** only, and might change significantly when the transaction is processed by the blockchain. CryptAPI is not responsible if blockchain fees differ from this estimation when forwarding the funds.
  * Does not include CryptAPI's fees.

**Method:** `GET`

**Path:** ```
https://api.cryptapi.io/{ticker}/estimate/
```


## Parameters

### Path Parameters

- **`ticker`** (`string`) (required) - Example: `btc`: The `ticker` parameter in this API request refers to the unique identifier of the cryptocurrency to which you are making the request. It is included in the URL of the request and helps to specify the exact cryptocurrency that you want to retrieve data for. The ticker is typically a short code that uniquely identifies the cryptocurrency, or the token and it's network/blockchain. For example, `btc` is the ticker for Bitcoin, and `trc20/usdt` is the ticker for USDT over TRC-20. Having this in mind, a request for USDT over TRC-20 will look like this: `https://api.cryptapi.io/trc20/usdt/create/`. 

**Notes:** 
* You can find all our tickers in our [cryptocurrencies](https://cryptapi.io/cryptocurrencies/) page.

### Query Parameters

- **`addresses`** (`integer`) - Example: `1`: The number of addresses to forward the funds to. Should be the same you set in the [`address`](/api/tickercreate#address) parameter. 

**Notes:** 
* The higher the number of addresses, the higher the blockchain fee will be.

- **`priority`** (`string`) - Example: `default`: This parameter allows you to set the priority with which funds should be forwarded to the provided **address**. It reflects the amount of fees paid to the blockchain network and can affect the speed of transaction confirmation. It's different per currency/network. 

**Notes:** 
* You can find the priorities to use with this endpoint, per blockchain, in our [knowledge base](https://support.cryptapi.io/article/how-the-priority-parameter-works). 
* Only supported when using Bitcoin, Ethereum/ERC-20 and Litecoin.

## Returns

Returns the estimated cost for the transaction.

- **`status`** (`string`): Status of the request. Should be `success` if the request didn't fail.

- **`estimated_cost`** (`integer`): Estimated cost in the blockchain's native cryptocurrency.

**Notes:**
* Example, transactions on the Bitcoin network will have costs estimated in BTC, while transactions using USDT on the TRC20 (Tron) network will have costs estimated in TRX.
* You can also check our cryptocurrencies page for a quick estimation of blockchain fees.

- **`estimated_cost_currency`** (`object`): Object with the estimated cost in various FIAT currencies.

Keys are the names of the currencies, values are the estimated costs. In case your desired FIAT currency is not included in the list of supported currencies, please don't hesitate to reach out to us so that we can add it to our service:

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

**Notes:**
Updated every 5 minutes from CoinMarketCap.



## Example Response

```json
{
  "status": "success",
  "estimated_cost": "0.00000213000",
  "estimated_cost_currency": {
    "AED": "0.84",
    "AUD": "0.35",
    "BGN": "0.38",
    "BRL": "1.26",
    "CAD": "0.31",
    "CHF": "0.18",
    "CNY": "1.65",
    "COP": "926.32",
    "CZK": "4.82",
    "DKK": "1.46",
    "EUR": "0.20",
    "GBP": "0.17",
    "HKD": "1.80",
    "HUF": "78.41",
    "IDR": "3731.31",
    "INR": "19.70",
    "JPY": "33.10",
    "LKR": "68.95",
    "MXN": "4.32",
    "MYR": "0.97",
    "NGN": "352.22",
    "NOK": "2.33",
    "PHP": "12.96",
    "PLN": "0.83",
    "RON": "0.99",
    "RUB": "18.11",
    "SEK": "2.20",
    "SGD": "0.29",
    "THB": "7.46",
    "TRY": "9.15",
    "TWD": "6.68",
    "UAH": "9.60",
    "UGX": "826.72",
    "USD": "0.23",
    "VND": "6016.13",
    "ZAR": "4.06"
  }
}
```