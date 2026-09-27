# Get Ticker Information

This method allows you to get information for a specific `ticker`.

**Notes:**
  * If the `prices` parameter is sent, the prices will be included in the response.

**Method:** `GET`

**Path:** ```
https://api.cryptapi.io/{ticker}/info/
```

## Parameters

### Path Parameters

- **`ticker`** (`string`) (required) - Example: `btc`: The `ticker` parameter in this API request refers to the unique identifier of the cryptocurrency to which you are making the request. It is included in the URL of the request and helps to specify the exact cryptocurrency that you want to retrieve data for. The ticker is typically a short code that uniquely identifies the cryptocurrency, or the token and it's network/blockchain.

For example, `btc` is the ticker for Bitcoin, and `trc20/usdt` is the ticker for USDT over TRC-20. Having this in mind, a request for USDT over TRC-20 will look like this: `https://api.cryptapi.io/trc20/usdt/create/`.

**Notes:**
* You can find all our tickers in our [cryptocurrencies](https://cryptapi.io/cryptocurrencies) page.
{% /endpointParameter %}

### Query Parameters

- **`prices`** (`integer`) - Example: `1`: If you want to receive also the coin prices, set to `1` to enable the prices.

---

## Returns

Returns information about the specified `ticker`.

- **`coin`** (`string`): Human readable name of the currency.

- **`logo`** (`string`): The cryptocurrency logo. Useful to display it to your users.

- **`ticker`** (`string`): Ticker of the currency.

- **`minimum_transaction`** (`integer`) **[DEPRECATED]**: The minimum transaction value for this currency is expressed as an integer to facilitate precision value calculations.

For example, in Python: `8000 / 10 ** 8`, where 8 represents the number of decimal places for the cryptocurrency.

**Important Note:**
Values below this value are disregarded by BlockBee.

- **`minimum_transaction_coin`** (`string`): Minimum transaction value for this currency.

**Important Note:**
Values below this value are disregarded by BlockBee.

- **`minimum_fee`** (`integer`) **[DEPRECATED]**: Minimum fee value expressed as an integer to facilitate precision value calculations.

For example, in Python: `8000 / 10 ** 8`, where 8 represents the number of decimal places for the cryptocurrency.

**Important Note:**
BlockBee currently doesn't charge a minimum fee. On Bitcoin and Bitcoin Cash there's a minimum transaction fee of 546 Satoshis due to dust threshold. For Litecoin it's 5460 Litoshis.

- **`minimum_fee_coin`** (`string`): The minimum fee value.

**Important Note:**
BlockBee currently doesn't charge a minimum fee. On Bitcoin and Bitcoin Cash there's a minimum transaction fee of 546 Satoshis due to dust threshold. For Litecoin it's 5460 Litoshis.

- **`fee_percent`** (`number`): Fee percentage for this currency.

- **`network_fee_estimation`** (`string`): Estimation of the blockchain fee for this cryptocurrency/token.

**Notes:**
This value is informative. To obtain a blockchain fee estimation use the estimate endpoint instead.

- **`status`** (`string`): Status of the request. Should be `success` if the request didn't fail.

- **`prices`** (`object`): Object with the exchange rate of this currency in various FIAT currencies.

Keys are the names of the FIAT currencies, values are the estimated costs. In case your desired FIAT currency is not included in the list of supported currencies, please don't hesitate to reach out to us so that we can add it to our service:

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

- **`prices_updated`** (`string`): Datetime of the last price update.



## Example Response

```json
{
  "coin": "Bitcoin",
  "logo": "https://api.cryptapi.io/media/token_logos/btc.png",
  "ticker": "btc",
  "minimum_transaction": 8000,
  "minimum_transaction_coin": "0.00008000",
  "minimum_fee": 546,
  "minimum_fee_coin": "0.00000546",
  "fee_percent": "1.000",
  "network_fee_estimation": "0.00000213",
  "status": "success",
  "prices": {
    "AED": "396670.6487738357",
    "AUD": "164918.3815821888",
    "BGN": "179415.3514938429",
    "BRL": "590043.3174856082",
    "CAD": "147390.5225671536",
    "CHF": "85663.8443900161",
    "CNY": "774067.3699410238",
    "COP": "435055971.0023019300",
    "CZK": "2265202.0635145637",
    "DKK": "685208.4835369790",
    "EUR": "91836.4258114617",
    "GBP": "79525.4974900668",
    "HKD": "847743.9480314957",
    "HUF": "36795946.8818968000",
    "IDR": "1752476212.5931296000",
    "INR": "9252608.6186747890",
    "JPY": "15553782.2703022100",
    "LKR": "32387917.7777397400",
    "MXN": "2031288.3776691742",
    "MYR": "456712.2757241769",
    "NGN": "165449934.6265569600",
    "NOK": "1093143.9098128967",
    "PHP": "6089640.4634586780",
    "PLN": "391876.4118251008",
    "RON": "465157.5109953081",
    "RUB": "8509597.1435057820",
    "SEK": "1032104.0819723385",
    "SGD": "137643.4035211648",
    "THB": "3502342.6344668176",
    "TRY": "4296777.8167729120",
    "TWD": "3136159.8249985916",
    "UAH": "4508904.8475288930",
    "UGX": "388339955.9410019500",
    "USD": "107995.3359480198",
    "VND": "2825993400.1024604000",
    "ZAR": "1907272.4736099340"
  },
  "prices_updated": "2025-07-02T14:15:17.955Z"
}
```