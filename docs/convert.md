# Convert Prices

This method enables seamless price conversion between fiat currencies and cryptocurrencies, as well as between different cryptocurrencies, by passing the ticker as a GET parameter. 
This approach provides flexibility and clarity when managing multiple conversions programmatically.

**Note:**
 * Prices are fetched every 5 minutes from CoinMarketCap.

**Method:** `GET`

**Path:** ```
https://api.cryptapi.io/convert/
```

---

## Parameters

### Query Parameters

- **`value`** (`number`) (required) - Example: `10`: Value you wish to convert in the cryptocurrency/token of the ticker you are using.

- **`from`** (`string`) (required) - Example: `usd`: Specify the currency you wish to convert **from**, whether it is FIAT or cryptocurrency. Check our full list of supported [cryptocurrencies](https://cryptapi.io/cryptocurrencies/).

**Supported FIAT currencies:**
* (USD) United States Dollar
* (EUR) Euro
* (GBP) Great Britain Pound
* (CAD) Canadian Dollar
* (JPY) Japanese Yen
* (AED) UAE Dollar
* (MYR) Malaysian Ringgit
* (IDR) Indonesian Rupiah
* (THB) Thai Baht
* (CHF) Swiss Franc
* (SGD) Singapore Dollar
* (RUB) Russian Ruble
* (ZAR) South African Rand
* (TRY) Turkish Lira
* (LKR) Sri Lankan Rupee
* (RON) Romanian Leu
* (BGN) Bulgarian Lev
* (HUF) Hungarian Forint
* (CZK) Czech Koruna
* (PHP) Philippine Peso
* (PLN) Poland Zloti
* (UGX) Uganda Shillings
* (MXN) Mexican Peso
* (INR) Indian Rupee
* (HKD) Hong Kong Dollar
* (CNY) Chinese Yuan
* (BRL) Brazilian Real
* (DKK) Danish Krone
* (TWD) New Taiwan Dollar
* (AUD) Australian Dollar
* (NGN) Nigerian Naira
* (SEK) Swedish Krona
* (NOK) Norwegian Krone
* (UAH) Ukrainian Hryvnia
* (VND) Vietnamese Dong

- **`to`** (`string`) (required) - Example: `btc`: Specify the currency you wish to convert **to**, whether it is FIAT or cryptocurrency. Check our full list of supported [cryptocurrencies](https://cryptapi.io/cryptocurrencies/).

**Supported FIAT currencies:**
* (USD) United States Dollar
* (EUR) Euro
* (GBP) Great Britain Pound
* (CAD) Canadian Dollar
* (JPY) Japanese Yen
* (AED) UAE Dollar
* (MYR) Malaysian Ringgit
* (IDR) Indonesian Rupiah
* (THB) Thai Baht
* (CHF) Swiss Franc
* (SGD) Singapore Dollar
* (RUB) Russian Ruble
* (ZAR) South African Rand
* (TRY) Turkish Lira
* (LKR) Sri Lankan Rupee
* (RON) Romanian Leu
* (BGN) Bulgarian Lev
* (HUF) Hungarian Forint
* (CZK) Czech Koruna
* (PHP) Philippine Peso
* (PLN) Poland Zloti
* (UGX) Uganda Shillings
* (MXN) Mexican Peso
* (INR) Indian Rupee
* (HKD) Hong Kong Dollar
* (CNY) Chinese Yuan
* (BRL) Brazilian Real
* (DKK) Danish Krone
* (TWD) New Taiwan Dollar
* (AUD) Australian Dollar
* (NGN) Nigerian Naira
* (SEK) Swedish Krona
* (NOK) Norwegian Krone
* (UAH) Ukrainian Hryvnia
* (VND) Vietnamese Dong

## Returns

Returns the converted value and the exchange rate.

- **`status`** (`string`): Status of the request. Should be `success` if the request didn't fail.

- **`value_coin`** (`string`): Converted value for the selected currencies.

- **`exchange_rate`** (`string`): The exchange rate between the two currencies.



## Example Response

```json
{
  "status": "success",
  "value_coin": "0.0000088",
  "exchange_rate": "0.00000880022"
}
```