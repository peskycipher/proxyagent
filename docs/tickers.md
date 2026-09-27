# Tickers

The `{ticker}` parameter is a crucial part of many BlockBee API requests. It's a unique identifier that specifies the cryptocurrency or token you want to interact with.

## Structure

A ticker is typically a short code that represents a specific cryptocurrency or a token on a particular network.

-   **For cryptocurrencies:** The ticker is usually the standard abbreviation, like `btc` for Bitcoin or `eth` for Ethereum.
-   **For tokens:** The ticker is composed of the network/blockchain followed by the token's symbol, separated by a slash. For example, `trc20/usdt` represents USDT on the TRC-20 (Tron) network.

## Examples

Here are a few examples of how tickers are used in an API path:

-   `https://api.cryptapi.io/btc/create/`
-   `https://api.cryptapi.io/trc20/usdt/create/`

## Finding Tickers

You can find a complete list of all supported tickers on our [Cryptocurrencies Page](https://cryptapi.io/cryptocurrencies).