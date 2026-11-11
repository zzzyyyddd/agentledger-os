use near_sdk::{env, near, AccountId, Gas, NearToken, Promise};

// Sandbox-only fixture: deletes its own disposable account before asking the treasury
// to refund it. This makes the actual refund transfer target a nonexistent account.
#[near(contract_state)]
#[derive(Default)]
pub struct RefundOwner;

#[near]
impl RefundOwner {
    pub fn delete_then_refund(&mut self, treasury: AccountId, beneficiary: AccountId, request_id: String) -> Promise {
        drop(Promise::new(env::current_account_id()).delete_account(beneficiary));
        let args = near_sdk::serde_json::json!({"request_id": request_id}).to_string().into_bytes();
        Promise::new(treasury).function_call("refund", args, NearToken::from_yoctonear(0), Gas::from_tgas(150))
    }
}
