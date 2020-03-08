var sync_balances;

async function handle_sync_balances() {
    sync_balances = $('#sync-balances').prop('checked');
    var max_balances = $('#max-balances').prop('checked');
    var default_account = (await web3.eth.getAccounts())[0];

    await update_rates();

    for (let i = 0; i < N_COINS; i++) {
        wallet_balances[i] = parseInt(await coins[i].methods.balanceOf(default_account).call());
        if(!default_account) wallet_balances[i] = 0
    }

    if (max_balances) {
        $(".currencies input").prop('disabled', true);
        for (let i = 0; i < N_COINS; i++) {
            var val = Math.floor(wallet_balances[i] * c_rates[i] * 100) / 100;
            $('#currency_' + i).val(val.toFixed(2));
        }
    } else 
        $(".currencies input").prop('disabled', false);

    for (let i = 0; i < N_COINS; i++)
        balances[i] = parseInt(await swap.methods.balances(i).call());
}

async function handle_add_liquidity() {
    var default_account = (await web3.eth.getAccounts())[0];
    var max_balances = $("#max-balances").is(':checked')
    var amounts = $("[id^=currency_]").toArray().map(x => $(x).val());
    for (let i = 0; i < N_COINS; i++) {
        let amount = cBN(Math.floor(amounts[i] / c_rates[i])).toString();
        let balance = await coins[i].methods.balanceOf(default_account).call();
        if(Math.abs(balance/amount-1) < 0.005) {
            amounts[i] = cBN(balance).toString();
        }
        else {
            amounts[i] = cBN(Math.floor(amounts[i] / c_rates[i])).toString(); // -> c-tokens
        }
    }
    if ($('#inf-approval').prop('checked'))
        await ensure_allowance(false);
    else
        await ensure_allowance(amounts)
    var token_amount = 0;
    if(parseInt(await swap_token.methods.totalSupply().call()) > 0) {    
        token_amount = await swap.methods.calc_token_amount(amounts, true).call();
        token_amount = cBN(Math.floor(token_amount * 0.99).toString()).toString();
    }
    await swap.methods.add_liquidity(amounts, token_amount).send({
        from: default_account,
        gas: 1300000});
    await handle_sync_balances();
    update_fee_info();
}

async function init_ui() {
    let infapproval = true;
    for (let i = 0; i < N_COINS; i++) {
        var default_account = (await web3.eth.getAccounts())[0];
        if (cBN(await coins[i].methods.allowance(default_account, swap_address).call()) <= max_allowance.div(cBN(2)))
            infapproval = false;        

        $('#currency_' + i).on('input', debounced(100, async function() {
            await calc_slippage(true);

            var el = $('#currency_' + i);
            if (this.value > wallet_balances[i] * c_rates[i])
                el.css('background-color', 'red')
            else
                el.css('background-color', 'blue');

            if (sync_balances) {
                for (let j = 0; j < N_COINS; j++)
                    if (j != i) {
                        var el_j = $('#currency_' + j);

                        if (balances[i] * c_rates[i] > 1) {
                            // proportional
                            var newval = this.value / c_rates[i] * balances[j] / balances[i];
                            newval = Math.floor(newval * c_rates[j] * 100) / 100;
                            el_j.val(newval);

                        } else {
                            // same value as we type
                            var newval = this.value;
                            el_j.val(newval);
                        }

                        // Balance not enough highlight
                        if (newval > wallet_balances[j] * c_rates[j])
                            el_j.css('background-color', 'red')
                        else
                            el_j.css('background-color', 'blue');
                    }
            }
        }));
    }

    if (infapproval)
        $('#inf-approval').prop('checked', true)
    else 
        $('#inf-approval').prop('checked', false);

    $('#sync-balances').change(handle_sync_balances);
    $('#max-balances').change(handle_sync_balances);
    $("#add-liquidity").click(handle_add_liquidity);
}

window.addEventListener('DOMContentLoaded', async () => {
    try {
        await init();
        update_fee_info();
        await handle_sync_balances();
        await calc_slippage(true);
        
        await init_ui();

        $("#from_currency").attr('disabled', false)

    }
    catch(err) {    
        console.error(err)
        if(err.reason == 'cancelDialog') {
            const web3 = new Web3(infura_url);
            window.web3 = web3

            await init_contracts();
            update_fee_info();
            await handle_sync_balances();
            await calc_slippage(true);

            await init_ui();
            $("#from_currency").attr('disabled', false)
        }
    }

});