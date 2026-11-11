use near_sdk::collections::{LookupMap, UnorderedSet};
use near_sdk::json_types::{U128, U64};
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError};

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub enum Status {
    Funded,
    Authorized,
    Pending,
    Completed,
    Failed,
    RefundPending,
    Refunded,
}
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Request {
    pub budget: U128,
    pub remaining: U128,
    pub expiry_ns: U64,
    pub status: Status,
    pub vendor: Option<AccountId>,
    pub amount: U128,
    pub payment_id: Option<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Treasury {
    owner: AccountId,
    operator: AccountId,
    vendors: UnorderedSet<AccountId>,
    requests: LookupMap<String, Request>,
    payments: LookupMap<String, String>,
    liabilities: u128,
}

#[near]
impl Treasury {
    #[init]
    pub fn new(owner: AccountId, operator: AccountId) -> Self {
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "initializer must be contract account"
        );
        Self {
            owner,
            operator,
            vendors: UnorderedSet::new(b"v"),
            requests: LookupMap::new(b"r"),
            payments: LookupMap::new(b"p"),
            liabilities: 0,
        }
    }
    fn owner_only(&self) {
        assert_eq!(env::predecessor_account_id(), self.owner, "owner only");
    }
    fn check_storage_funding(&self) {
        let storage = u128::from(
            env::storage_usage()
                .checked_add(2048)
                .expect("storage overflow"),
        )
        .checked_mul(env::storage_byte_cost().as_yoctonear())
        .expect("storage cost overflow");
        let needed = self
            .liabilities
            .checked_add(storage)
            .expect("liability overflow");
        assert!(
            env::account_balance().as_yoctonear() >= needed,
            "insufficient storage reserve"
        );
    }
    pub fn set_vendor(&mut self, vendor: AccountId, allowed: bool) {
        self.owner_only();
        if allowed {
            self.vendors.insert(&vendor);
        } else {
            self.vendors.remove(&vendor);
        }
        self.check_storage_funding();
    }
    #[payable]
    pub fn create_request(&mut self, request_id: String, expiry_ns: U64) {
        self.owner_only();
        assert!(
            !request_id.is_empty() && request_id.len() <= 64,
            "invalid request id"
        );
        assert!(self.requests.get(&request_id).is_none(), "request exists");
        let budget = env::attached_deposit().as_yoctonear();
        assert!(budget > 0, "deposit required");
        assert!(expiry_ns.0 > env::block_timestamp(), "expired");
        self.liabilities = self
            .liabilities
            .checked_add(budget)
            .expect("liability overflow");
        self.requests.insert(
            &request_id,
            &Request {
                budget: U128(budget),
                remaining: U128(budget),
                expiry_ns,
                status: Status::Funded,
                vendor: None,
                amount: U128(0),
                payment_id: None,
            },
        );
        self.check_storage_funding();
    }
    pub fn authorize(
        &mut self,
        request_id: String,
        payment_id: String,
        vendor: AccountId,
        amount: U128,
    ) {
        self.owner_only();
        let mut r = self.requests.get(&request_id).expect("unknown request");
        assert_eq!(r.status, Status::Funded, "invalid status");
        assert!(env::block_timestamp() < r.expiry_ns.0, "expired");
        assert!(self.vendors.contains(&vendor), "vendor not allowed");
        assert!(amount.0 > 0 && amount.0 <= r.remaining.0, "budget exceeded");
        assert!(
            !payment_id.is_empty() && payment_id.len() <= 64,
            "invalid payment id"
        );
        assert!(
            self.payments.get(&payment_id).is_none(),
            "duplicate payment id"
        );
        self.payments.insert(&payment_id, &request_id);
        r.payment_id = Some(payment_id);
        r.vendor = Some(vendor);
        r.amount = amount;
        r.status = Status::Authorized;
        self.requests.insert(&request_id, &r);
        self.check_storage_funding();
    }
    pub fn execute(&mut self, request_id: String) -> Promise {
        let caller = env::predecessor_account_id();
        assert!(
            caller == self.owner || caller == self.operator,
            "unauthorized"
        );
        let mut r = self.requests.get(&request_id).expect("unknown request");
        assert_eq!(r.status, Status::Authorized, "invalid status");
        assert!(env::block_timestamp() < r.expiry_ns.0, "expired");
        let vendor = r.vendor.clone().unwrap();
        assert!(self.vendors.contains(&vendor), "vendor not allowed");
        self.check_storage_funding();
        self.liabilities = self
            .liabilities
            .checked_sub(r.amount.0)
            .expect("liability underflow");
        r.remaining = U128(r.remaining.0.checked_sub(r.amount.0).expect("underflow"));
        r.status = Status::Pending;
        self.requests.insert(&request_id, &r);
        Promise::new(vendor)
            .transfer(NearToken::from_yoctonear(r.amount.0))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(15))
                    .on_transfer(request_id),
            )
    }
    #[private]
    pub fn on_transfer(&mut self, request_id: String) -> bool {
        let success = match env::promise_result_checked(0, 0) {
            Ok(_) | Err(PromiseError::TooLong(_)) => true,
            Err(PromiseError::Failed) => false,
            Err(_) => env::panic_str("unknown promise result; remain pending"),
        };
        let mut r = self.requests.get(&request_id).expect("unknown request");
        assert_eq!(r.status, Status::Pending, "invalid status");
        if success {
            r.status = Status::Completed;
        } else {
            self.liabilities = self
                .liabilities
                .checked_add(r.amount.0)
                .expect("liability overflow");
            r.remaining = U128(r.remaining.0.checked_add(r.amount.0).expect("overflow"));
            r.status = Status::Failed;
        }
        self.requests.insert(&request_id, &r);
        success
    }
    pub fn refund(&mut self, request_id: String) -> Promise {
        self.owner_only();
        let mut r = self.requests.get(&request_id).expect("unknown request");
        assert!(
            matches!(
                r.status,
                Status::Funded | Status::Authorized | Status::Failed | Status::Completed
            ),
            "invalid status"
        );
        let amount = r.remaining.0;
        assert!(amount > 0, "nothing to refund");
        self.check_storage_funding();
        self.liabilities = self
            .liabilities
            .checked_sub(amount)
            .expect("liability underflow");
        r.remaining = U128(0);
        r.status = Status::RefundPending;
        self.requests.insert(&request_id, &r);
        Promise::new(self.owner.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(15))
                    .on_refund(request_id, U128(amount)),
            )
    }
    #[private]
    pub fn on_refund(&mut self, request_id: String, amount: U128) -> bool {
        let success = match env::promise_result_checked(0, 0) {
            Ok(_) | Err(PromiseError::TooLong(_)) => true,
            Err(PromiseError::Failed) => false,
            Err(_) => env::panic_str("unknown promise result; remain pending"),
        };
        let mut r = self.requests.get(&request_id).expect("unknown request");
        assert_eq!(r.status, Status::RefundPending, "invalid status");
        if success {
            r.status = Status::Refunded;
        } else {
            self.liabilities = self
                .liabilities
                .checked_add(amount.0)
                .expect("liability overflow");
            r.remaining = U128(amount.0);
            r.status = Status::Failed;
        }
        self.requests.insert(&request_id, &r);
        success
    }
    pub fn get_request(&self, request_id: String) -> Option<Request> {
        self.requests.get(&request_id)
    }
    pub fn get_payment_request(&self, payment_id: String) -> Option<String> {
        self.payments.get(&payment_id)
    }
    pub fn is_vendor_allowed(&self, vendor: AccountId) -> bool {
        self.vendors.contains(&vendor)
    }
    pub fn get_liabilities(&self) -> U128 {
        U128(self.liabilities)
    }
    pub fn get_roles(&self) -> (AccountId, AccountId) {
        (self.owner.clone(), self.operator.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env, PromiseResult};
    fn id(s: &str) -> AccountId {
        s.parse().unwrap()
    }
    fn context(who: &str, deposit: u128, time: u64) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(id("treasury.testnet"))
            .predecessor_account_id(id(who))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(time);
        testing_env!(b.build());
    }
    fn setup() -> Treasury {
        context("treasury.testnet", 0, 1);
        let mut t = Treasury::new(id("owner.testnet"), id("operator.testnet"));
        context("owner.testnet", 0, 1);
        t.set_vendor(id("vendor.testnet"), true);
        context("owner.testnet", 100, 1);
        t.create_request("r".into(), U64(100));
        context("owner.testnet", 0, 2);
        t
    }
    fn auth(t: &mut Treasury, payment: &str, vendor: &str, amount: u128) {
        t.authorize("r".into(), payment.into(), id(vendor), U128(amount));
    }
    #[test]
    #[should_panic(expected = "owner only")]
    fn unauthorized() {
        let mut t = setup();
        context("bad.testnet", 0, 2);
        auth(&mut t, "p", "vendor.testnet", 10);
    }
    #[test]
    #[should_panic(expected = "budget exceeded")]
    fn budget() {
        let mut t = setup();
        auth(&mut t, "p", "vendor.testnet", 101);
    }
    #[test]
    #[should_panic(expected = "vendor not allowed")]
    fn invalid_vendor() {
        let mut t = setup();
        auth(&mut t, "p", "bad.testnet", 1);
    }
    #[test]
    #[should_panic(expected = "expired")]
    fn expired() {
        let mut t = setup();
        context("owner.testnet", 0, 100);
        auth(&mut t, "p", "vendor.testnet", 1);
    }
    #[test]
    #[should_panic(expected = "duplicate payment id")]
    fn duplicate() {
        let mut t = setup();
        auth(&mut t, "p", "vendor.testnet", 10);
        context("owner.testnet", 100, 2);
        t.create_request("r2".into(), U64(100));
        context("owner.testnet", 0, 2);
        t.authorize("r2".into(), "p".into(), id("vendor.testnet"), U128(10));
    }
    #[test]
    #[should_panic(expected = "invalid status")]
    fn double_release() {
        let mut t = setup();
        auth(&mut t, "p", "vendor.testnet", 10);
        let _ = t.execute("r".into());
        let _ = t.execute("r".into());
    }
    #[test]
    fn failure_and_refund() {
        let mut t = setup();
        auth(&mut t, "p", "vendor.testnet", 10);
        let _ = t.execute("r".into());
        testing_env!(
            VMContextBuilder::new()
                .current_account_id(id("treasury.testnet"))
                .predecessor_account_id(id("treasury.testnet"))
                .build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Failed],
        );
        assert!(!t.on_transfer("r".into()));
        assert_eq!(t.get_request("r".into()).unwrap().remaining.0, 100);
        context("owner.testnet", 0, 2);
        let _ = t.refund("r".into());
        testing_env!(
            VMContextBuilder::new()
                .current_account_id(id("treasury.testnet"))
                .predecessor_account_id(id("treasury.testnet"))
                .build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Successful(vec![])],
        );
        assert!(t.on_refund("r".into(), U128(100)));
        assert_eq!(t.get_request("r".into()).unwrap().status, Status::Refunded);
    }
    fn callback(result: PromiseResult) {
        testing_env!(
            VMContextBuilder::new()
                .current_account_id(id("treasury.testnet"))
                .predecessor_account_id(id("treasury.testnet"))
                .build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![result]
        );
    }
    #[test]
    fn oversized_success_is_not_a_failed_transfer() {
        let mut t = setup();
        auth(&mut t, "p", "vendor.testnet", 10);
        let _ = t.execute("r".into());
        callback(PromiseResult::Successful(vec![1]));
        assert!(t.on_transfer("r".into()));
        let request = t.get_request("r".into()).unwrap();
        assert_eq!(request.status, Status::Completed);
        assert_eq!(request.remaining.0, 90);
    }
    #[test]
    fn failed_refund_restores_balance_and_can_retry_refund() {
        let mut t = setup();
        let _ = t.refund("r".into());
        callback(PromiseResult::Failed);
        assert!(!t.on_refund("r".into(), U128(100)));
        assert_eq!(t.get_request("r".into()).unwrap().remaining.0, 100);
        context("owner.testnet", 0, 2);
        let _ = t.refund("r".into());
        assert_eq!(
            t.get_request("r".into()).unwrap().status,
            Status::RefundPending
        );
    }
    #[test]
    #[should_panic(expected = "invalid status")]
    fn pending_transfer_cannot_refund() {
        let mut t = setup();
        auth(&mut t, "p", "vendor.testnet", 10);
        let _ = t.execute("r".into());
        let _ = t.refund("r".into());
    }
    #[test]
    #[should_panic(expected = "invalid status")]
    fn pending_refund_cannot_be_repeated() {
        let mut t = setup();
        let _ = t.refund("r".into());
        let _ = t.refund("r".into());
    }
    #[test]
    #[should_panic(expected = "unauthorized")]
    fn non_operator_cannot_execute() {
        let mut t = setup();
        auth(&mut t, "p", "vendor.testnet", 10);
        context("bad.testnet", 0, 2);
        let _ = t.execute("r".into());
    }
    #[test]
    #[should_panic(expected = "vendor not allowed")]
    fn revoked_vendor_cannot_execute() {
        let mut t = setup();
        auth(&mut t, "p", "vendor.testnet", 10);
        t.set_vendor(id("vendor.testnet"), false);
        let _ = t.execute("r".into());
    }
    #[test]
    #[should_panic(expected = "initializer must be contract account")]
    fn reject_unauthorized_initialization() {
        context("bad.testnet", 0, 1);
        let _ = Treasury::new(id("bad.testnet"), id("bad.testnet"));
    }
    #[test]
    #[should_panic(expected = "insufficient storage reserve")]
    fn reject_unfunded_storage() {
        context("treasury.testnet", 0, 1);
        let mut t = Treasury::new(id("owner.testnet"), id("operator.testnet"));
        let mut b = VMContextBuilder::new();
        b.current_account_id(id("treasury.testnet"))
            .predecessor_account_id(id("owner.testnet"))
            .attached_deposit(NearToken::from_yoctonear(100))
            .account_balance(NearToken::from_yoctonear(100))
            .block_timestamp(1);
        testing_env!(b.build());
        t.create_request("r".into(), U64(100));
    }
    #[test]
    fn liabilities_follow_pending_failure_and_refund() {
        let mut t = setup();
        assert_eq!(t.get_liabilities().0, 100);
        auth(&mut t, "p", "vendor.testnet", 10);
        let _ = t.execute("r".into());
        assert_eq!(t.get_liabilities().0, 90);
        callback(PromiseResult::Failed);
        assert!(!t.on_transfer("r".into()));
        assert_eq!(t.get_liabilities().0, 100);
        context("owner.testnet", 0, 2);
        let _ = t.refund("r".into());
        assert_eq!(t.get_liabilities().0, 0);
        callback(PromiseResult::Failed);
        assert!(!t.on_refund("r".into(), U128(100)));
        assert_eq!(t.get_liabilities().0, 100);
    }
}
