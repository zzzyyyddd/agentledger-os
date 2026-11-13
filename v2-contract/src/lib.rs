use near_sdk::collections::LookupMap;
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
    pub request_id: String,
    pub owner: AccountId,
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
    requests: LookupMap<String, Request>,
    payments: LookupMap<String, String>,
    owner_counts: LookupMap<AccountId, u32>,
    owner_requests: LookupMap<String, String>,
    liabilities: u128,
}

#[near]
impl Treasury {
    #[init]
    pub fn new() -> Self {
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "initializer must be contract account"
        );
        Self {
            requests: LookupMap::new(b"r"),
            payments: LookupMap::new(b"p"),
            owner_counts: LookupMap::new(b"c"),
            owner_requests: LookupMap::new(b"i"),
            liabilities: 0,
        }
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
    #[payable]
    pub fn create_request(
        &mut self,
        request_id: String,
        payment_id: String,
        expiry_ns: U64,
        vendor: AccountId,
        budget: U128,
    ) {
        assert!(
            !request_id.is_empty() && request_id.len() <= 64,
            "invalid request id"
        );
        assert!(self.requests.get(&request_id).is_none(), "request exists");
        assert!(
            !payment_id.is_empty() && payment_id.len() <= 64,
            "invalid payment id"
        );
        assert!(
            self.payments.get(&payment_id).is_none(),
            "duplicate payment id"
        );
        let budget = budget.0;
        assert!(
            budget > 0 && budget <= 100_000_000_000_000_000_000_000,
            "budget out of range"
        );
        let deposit = budget
            .checked_add(30_000_000_000_000_000_000_000)
            .expect("overflow");
        assert_eq!(
            env::attached_deposit().as_yoctonear(),
            deposit,
            "deposit must cover budget and storage fee"
        );
        let now = env::block_timestamp();
        assert!(
            expiry_ns.0 > now && expiry_ns.0 <= now.saturating_add(86_400_000_000_000),
            "invalid expiry"
        );
        let owner = env::predecessor_account_id();
        let count = self.owner_counts.get(&owner).unwrap_or(0);
        assert!(count < 1000, "request limit reached");
        self.owner_requests
            .insert(&format!("{owner}:{count}"), &request_id);
        self.owner_counts.insert(&owner, &(count + 1));
        self.liabilities = self
            .liabilities
            .checked_add(budget)
            .expect("liability overflow");
        self.payments.insert(&payment_id, &request_id);
        self.requests.insert(
            &request_id,
            &Request {
                request_id: request_id.clone(),
                owner,
                budget: U128(budget),
                remaining: U128(budget),
                expiry_ns,
                status: Status::Funded,
                vendor: Some(vendor),
                amount: U128(0),
                payment_id: Some(payment_id),
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
        let mut r = self.requests.get(&request_id).expect("unknown request");
        assert_eq!(env::predecessor_account_id(), r.owner, "owner only");
        assert_eq!(r.status, Status::Funded, "invalid status");
        assert!(env::block_timestamp() < r.expiry_ns.0, "expired");
        assert_eq!(
            r.vendor.as_ref(),
            Some(&vendor),
            "vendor not approved for request"
        );
        assert!(amount.0 > 0 && amount.0 <= r.remaining.0, "budget exceeded");
        assert_eq!(
            r.payment_id.as_ref(),
            Some(&payment_id),
            "payment id mismatch"
        );
        assert_eq!(
            self.payments.get(&payment_id).as_ref(),
            Some(&request_id),
            "payment link mismatch"
        );
        r.vendor = Some(vendor);
        r.amount = amount;
        r.status = Status::Authorized;
        self.requests.insert(&request_id, &r);
        self.check_storage_funding();
    }
    pub fn execute(&mut self, request_id: String) -> Promise {
        let mut r = self.requests.get(&request_id).expect("unknown request");
        assert_eq!(env::predecessor_account_id(), r.owner, "owner only");
        assert_eq!(r.status, Status::Authorized, "invalid status");
        assert!(env::block_timestamp() < r.expiry_ns.0, "expired");
        let vendor = r.vendor.clone().unwrap();
        assert_eq!(
            r.vendor.as_ref(),
            Some(&vendor),
            "vendor not approved for request"
        );
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
        let mut r = self.requests.get(&request_id).expect("unknown request");
        assert_eq!(env::predecessor_account_id(), r.owner, "owner only");
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
        Promise::new(r.owner.clone())
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
    /// A payment is indexed from creation, including while awaiting approval.
    pub fn get_payment(&self, payment_id: String) -> Option<Request> {
        self.payments
            .get(&payment_id)
            .and_then(|id| self.requests.get(&id))
    }
    /// Owner history is public on chain and paginated to at most 50 entries.
    pub fn get_payments_by_owner(
        &self,
        owner: AccountId,
        from: u32,
        limit: u32,
    ) -> Vec<(String, Request)> {
        self.get_owner_requests(owner, from, limit)
            .into_iter()
            .filter_map(|(_, request)| request.payment_id.clone().map(|id| (id, request)))
            .collect()
    }
    pub fn get_request(&self, request_id: String) -> Option<Request> {
        self.requests.get(&request_id)
    }
    pub fn get_owner_requests(
        &self,
        owner: AccountId,
        from: u32,
        limit: u32,
    ) -> Vec<(String, Request)> {
        let count = self.owner_counts.get(&owner).unwrap_or(0);
        let end = from.saturating_add(limit.min(50)).min(count);
        (from.min(count)..end)
            .filter_map(|index| {
                let id = self.owner_requests.get(&format!("{owner}:{index}"))?;
                self.requests.get(&id).map(|request| (id, request))
            })
            .collect()
    }
    pub fn get_payment_request(&self, payment_id: String) -> Option<String> {
        self.payments.get(&payment_id)
    }
    pub fn get_liabilities(&self) -> U128 {
        U128(self.liabilities)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env, PromiseResult};
    const FEE: u128 = 30_000_000_000_000_000_000_000;
    fn id(s: &str) -> AccountId {
        s.parse().unwrap()
    }
    fn context(who: &str, deposit: u128, time: u64) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(id("judge.testnet"))
            .predecessor_account_id(id(who))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(time);
        testing_env!(b.build());
    }
    fn callback(result: PromiseResult) {
        testing_env!(
            VMContextBuilder::new()
                .current_account_id(id("judge.testnet"))
                .predecessor_account_id(id("judge.testnet"))
                .build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![result]
        );
    }
    fn setup() -> Treasury {
        context("judge.testnet", 0, 1);
        let mut t = Treasury::new();
        context("alice.testnet", FEE + 100, 1);
        t.create_request(
            "r".into(),
            "p".into(),
            U64(100),
            id("vendor.testnet"),
            U128(100),
        );
        context("alice.testnet", 0, 2);
        t
    }
    fn authorize(t: &mut Treasury) {
        t.authorize("r".into(), "p".into(), id("vendor.testnet"), U128(100));
    }
    #[test]
    fn owner_index_recovers_only_requested_owners_records() {
        let mut t = setup();
        context("bob.testnet", FEE + 100, 2);
        t.create_request(
            "r2".into(),
            "p2".into(),
            U64(100),
            id("vendor.testnet"),
            U128(100),
        );
        let alice = t.get_owner_requests(id("alice.testnet"), 0, 50);
        let bob = t.get_owner_requests(id("bob.testnet"), 0, 50);
        assert_eq!(alice.len(), 1);
        assert_eq!(alice[0].0, "r");
        assert_eq!(alice[0].1.owner, id("alice.testnet"));
        assert_eq!(bob.len(), 1);
        assert_eq!(bob[0].0, "r2");
        assert!(t.get_owner_requests(id("alice.testnet"), 1, 50).is_empty());
    }
    #[test]
    fn payment_is_visible_before_approval_and_paginated_by_owner() {
        let mut t = setup();
        let p = t.get_payment("p".into()).unwrap();
        assert_eq!(p.request_id, "r");
        assert_eq!(p.status, Status::Funded);
        assert_eq!(p.payment_id.as_deref(), Some("p"));
        assert!(t.get_payment("missing".into()).is_none());
        let list = t.get_payments_by_owner(id("alice.testnet"), 0, 50);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].0, "p");
        assert!(t.get_payments_by_owner(id("bob.testnet"), 0, 50).is_empty());
        assert!(t
            .get_payments_by_owner(id("alice.testnet"), 1, 50)
            .is_empty());
        authorize(&mut t);
        assert_eq!(
            t.get_payment("p".into()).unwrap().status,
            Status::Authorized
        );
    }
    #[test]
    #[should_panic(expected = "request exists")]
    fn duplicate_request_rejected_even_with_another_payment_id() {
        let mut t = setup();
        context("alice.testnet", FEE + 100, 2);
        t.create_request(
            "r".into(),
            "another".into(),
            U64(100),
            id("vendor.testnet"),
            U128(100),
        );
    }
    #[test]
    #[should_panic(expected = "payment id mismatch")]
    fn approval_cannot_change_payment_identifier() {
        let mut t = setup();
        t.authorize(
            "r".into(),
            "another".into(),
            id("vendor.testnet"),
            U128(100),
        );
    }
    #[test]
    fn transfer_failure_restores_liability_and_refund() {
        let mut t = setup();
        authorize(&mut t);
        let _ = t.execute("r".into());
        assert_eq!(t.get_liabilities().0, 0);
        callback(PromiseResult::Failed);
        assert!(!t.on_transfer("r".into()));
        assert_eq!(t.get_liabilities().0, 100);
        assert_eq!(t.get_request("r".into()).unwrap().remaining.0, 100);
        context("alice.testnet", 0, 3);
        let _ = t.refund("r".into());
        callback(PromiseResult::Successful(vec![]));
        assert!(t.on_refund("r".into(), U128(100)));
        assert_eq!(t.get_liabilities().0, 0);
        assert_eq!(t.get_request("r".into()).unwrap().status, Status::Refunded);
    }
    #[test]
    fn failed_refund_restores_liability() {
        let mut t = setup();
        let _ = t.refund("r".into());
        callback(PromiseResult::Failed);
        assert!(!t.on_refund("r".into(), U128(100)));
        assert_eq!(t.get_liabilities().0, 100);
        assert_eq!(t.get_request("r".into()).unwrap().remaining.0, 100);
    }
    #[test]
    #[should_panic(expected = "owner only")]
    fn other_owner_cannot_authorize() {
        let mut t = setup();
        context("bob.testnet", 0, 2);
        authorize(&mut t);
    }
    #[test]
    #[should_panic(expected = "owner only")]
    fn other_owner_cannot_refund() {
        let mut t = setup();
        context("bob.testnet", 0, 2);
        let _ = t.refund("r".into());
    }
    #[test]
    #[should_panic(expected = "owner only")]
    fn other_owner_cannot_execute() {
        let mut t = setup();
        authorize(&mut t);
        context("bob.testnet", 0, 2);
        let _ = t.execute("r".into());
    }
    #[test]
    #[should_panic(expected = "vendor not approved for request")]
    fn different_vendor_rejected() {
        let mut t = setup();
        t.authorize("r".into(), "p".into(), id("other.testnet"), U128(100));
    }
    #[test]
    #[should_panic(expected = "expired")]
    fn expired_cannot_authorize() {
        let mut t = setup();
        context("alice.testnet", 0, 100);
        authorize(&mut t);
    }
    #[test]
    #[should_panic(expected = "duplicate payment id")]
    fn duplicate_payment_rejected() {
        let mut t = setup();
        authorize(&mut t);
        context("bob.testnet", FEE + 100, 2);
        t.create_request(
            "r2".into(),
            "p".into(),
            U64(100),
            id("vendor.testnet"),
            U128(100),
        );
    }
    #[test]
    #[should_panic(expected = "invalid status")]
    fn pending_cannot_execute_twice() {
        let mut t = setup();
        authorize(&mut t);
        let _ = t.execute("r".into());
        let _ = t.execute("r".into());
    }
    #[test]
    #[should_panic(expected = "invalid status")]
    fn pending_cannot_refund() {
        let mut t = setup();
        authorize(&mut t);
        let _ = t.execute("r".into());
        let _ = t.refund("r".into());
    }
    #[test]
    #[should_panic(expected = "invalid status")]
    fn pending_refund_cannot_repeat() {
        let mut t = setup();
        let _ = t.refund("r".into());
        let _ = t.refund("r".into());
    }
    #[test]
    #[should_panic(expected = "deposit must cover budget and storage fee")]
    fn storage_fee_required() {
        context("judge.testnet", 0, 1);
        let mut t = Treasury::new();
        context("alice.testnet", 100, 1);
        t.create_request(
            "r".into(),
            "p".into(),
            U64(100),
            id("vendor.testnet"),
            U128(100),
        );
    }
}
