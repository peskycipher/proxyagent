# CryptAPI Service Information

Endpoint that provides information regarding CryptAPI API Service (e.g supported blockchains, cryptocurrencies and tokens).

**Method:** `GET`

**Path:** ```
https://api.cryptapi.io/info/
```

---

## Parameters

### Query Parameters

- **`prices`** (`integer`) - Example: `1`: If you want to receive also the coin prices, set to `1` to enable the prices.

---

## Returns

Returns a dictionary where keys are cryptocurrency tickers (e.g., `btc`) or blockchain tickers (e.g., `avax-c`). A `fee_tiers` key is also present at the top level.

- **`btc`** (`object`): This object contains details about a specific cryptocurrency. The key is the dynamic ticker of the coin. The example shown is for Bitcoin (`btc`).

  - **`coin`** (`string`): Human readable name of the currency.

  - **`logo`** (`string`): The cryptocurrency logo. Useful to display it to your users.

  - **`ticker`** (`string`): Ticker of the currency.

  - **`minimum_transaction`** (`integer`) **[DEPRECATED]**: The minimum transaction value for this currency is expressed as an integer to facilitate precision value calculations.

For example, in Python: `8000 / 10 ** 8`, where 8 represents the number of decimal places for the cryptocurrency.

**Important Note:**
Values below this value are disregarded by CryptAPI.

  - **`minimum_transaction_coin`** (`string`): Minimum transaction value for this currency.

**Important Note:**
Values below this value are disregarded by CryptAPI.

  - **`minimum_fee`** (`integer`) **[DEPRECATED]**: Minimum fee value expressed as an integer to facilitate precision value calculations.

For example, in Python: `8000 / 10 ** 8`, where 8 represents the number of decimal places for the cryptocurrency.

**Important Note:**
CryptAPI currently doesn't charge a minimum fee. On Bitcoin and Bitcoin Cash there's a minimum transaction fee of 546 Satoshis due to dust threshold. For Litecoin it's 5460 Litoshis.

  - **`minimum_fee_coin`** (`string`): The minimum fee value.

**Important Note:**
CryptAPI currently doesn't charge a minimum fee. On Bitcoin and Bitcoin Cash there's a minimum transaction fee of 546 Satoshis due to dust threshold. For Litecoin it's 5460 Litoshis.

  - **`fee_percent`** (`string`): Fee percentage for this currency.

**Notes:**
You can check our fees in this page.

  - **`network_fee_estimation`** (`string`): Estimation of the blockchain fee for this cryptocurrency/token.

**Notes:**
This value is informative. To obtain a blockchain fee estimation use the estimate endpoint instead.

  - **`prices`** (`object`): Object with the exchange rate of this currency in various FIAT currencies. Keys are the names of the FIAT currencies, values are the exchange rates.

A list of supported FIAT currencies can be found below. If your desired FIat currency is not on the list, please contact us.

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

- **`avax-c`** (`object`): This object contains details for a specific blockchain. The key is the dynamic ticker of the blockchain. Inside, it contains objects for each token supported on that blockchain, with the token's ticker as the key.

  - **`avax`** (`object`): This object contains details about a specific token on the blockchain. The key is the dynamic ticker of the token. The fields within this object are identical to those in the top-level cryptocurrency object (e.g., `btc`).

- **`fee_tiers`** (`object[]`): An array of objects detailing the fee structure based on volume.

  - **`minimum`** (`string`): The minimum USD volume for this fee tier to apply.
  - **`fee`** (`string`): The fee percentage for this tier.



## Example Response

```json
{
  "btc": {
    "coin": "Bitcoin",
    "logo": "https://api.cryptapi.io/media/token_logos/btc.png",
    "ticker": "btc",
    "minimum_transaction": 8000,
    "minimum_transaction_coin": "0.00008000",
    "minimum_fee": 546,
    "minimum_fee_coin": "0.00000546",
    "fee_percent": "1.000",
    "network_fee_estimation": "0.00000263",
    "prices": {
      "USD": "113687.2123324492",
      "EUR": "97303.8618504321"
    },
    "prices_updated": "2025-07-10T17:35:17.529Z"
  },
  "avax-c": {
    "avax": {
      "coin": "AVAX",
      "logo": "https://api.cryptapi.io/media/token_logos/avax_avax.png",
      "ticker": "avax",
      "minimum_transaction": 10000000000000000,
      "minimum_transaction_coin": "0.01000000",
      "minimum_fee": 0,
      "minimum_fee_coin": "0E-8",
      "fee_percent": "1.000",
      "network_fee_estimation": "0.0002641508790732",
      "prices": {
        "USD": "19.8455617107",
        "EUR": "16.9856376581"
      },
      "prices_updated": "2025-07-10T17:35:17.529Z"
    }
  },
  "fee_tiers": [
    {
      "minimum": "0.00",
      "fee": "1.000"
    },
    {
      "minimum": "10000.00",
      "fee": "0.900"
    }
  ]
}
```