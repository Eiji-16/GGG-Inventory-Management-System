<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\AppSetting;
use App\Models\Product;
use App\Models\SafetyStock;
use App\Models\User;
use App\Services\ReorderPointService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Settings → "Security and defaults" (2026-11-11): default lead time,
 * the backup reminder, and requiring the authenticator app.
 */
class SystemPreferencesTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, array $extra = []): User
    {
        return User::factory()->create(['role' => $role, 'status' => User::STATUS_ACTIVE] + $extra);
    }

    /* ---------- Default lead time ---------- */

    public function test_default_lead_time_is_used_when_product_and_supplier_have_none(): void
    {
        $owner = $this->user(User::ROLE_SUPER_ADMIN);
        $product = Product::create(['code' => 'PRD-LEAD', 'name' => 'Lead Cap', 'stock_on_hand' => 400]);
        SafetyStock::create(['product_id' => $product->id, 'safety_stock' => 5, 'lead_time_days' => null]);

        // 365 sold in the last 12 months = 1 per day.
        $this->actingAs($owner)->postJson('/api/stock-movements', [
            'unitPrice' => 10, 'productId' => 'PRD-LEAD', 'type' => 'Stock Out', 'qty' => 365, 'date' => now()->toDateString(),
        ])->assertCreated();

        $points = new ReorderPointService();
        $this->assertSame(5, $points->forProduct($product->fresh(['safetyStock', 'supplier'])), 'No lead time: reorder point = safety stock.');

        $this->actingAs($owner)->putJson('/api/settings/system', ['defaultLeadTimeDays' => 7])
            ->assertOk()
            ->assertJsonPath('defaultLeadTimeDays', 7);
        $this->assertSame(7, AppSetting::defaultLeadTimeDays());

        $points = new ReorderPointService();
        $this->assertSame(12, $points->forProduct($product->fresh(['safetyStock', 'supplier'])), '5 + 1/day × 7 days = 12');

        // A product's own lead time still wins over the default.
        $product->safetyStock->update(['lead_time_days' => 2]);
        $points = new ReorderPointService();
        $this->assertSame(7, $points->forProduct($product->fresh(['safetyStock', 'supplier'])), '5 + 1/day × 2 days = 7');

        // Cleared = not used.
        $this->actingAs($owner)->putJson('/api/settings/system', ['defaultLeadTimeDays' => null])->assertOk();
        $this->assertNull(AppSetting::defaultLeadTimeDays());
    }

    public function test_only_the_super_admin_can_change_the_system_rules(): void
    {
        foreach ([User::ROLE_ADMIN, User::ROLE_STAFF] as $role) {
            $this->actingAs($this->user($role))
                ->putJson('/api/settings/system', ['defaultLeadTimeDays' => 9, 'requireAuthenticator' => true])
                ->assertForbidden();
        }
        $this->assertNull(AppSetting::defaultLeadTimeDays());
        $this->assertFalse(AppSetting::requireAuthenticator());

        $this->actingAs($this->user(User::ROLE_SUPER_ADMIN))
            ->putJson('/api/settings/system', ['defaultLeadTimeDays' => 400])
            ->assertUnprocessable();
    }

    /* ---------- Backup reminder ---------- */

    public function test_backup_reminder_shows_until_a_recent_backup_exists(): void
    {
        $owner = $this->user(User::ROLE_SUPER_ADMIN);

        $this->actingAs($owner)->getJson('/api/settings/system')
            ->assertOk()
            ->assertJsonPath('backupDue', true)
            ->assertJsonPath('lastBackupAt', null);

        ActivityLog::record('system.export', 'Exported a full database backup', 'download', [], $owner->id);
        $this->actingAs($owner)->getJson('/api/settings/system')->assertJsonPath('backupDue', false);

        // Older than 7 days: due again.
        ActivityLog::query()->update(['created_at' => now()->subDays(8)]);
        $this->actingAs($owner)->getJson('/api/settings/system')->assertJsonPath('backupDue', true);

        // Staff can read the rules but never the backup details.
        $this->actingAs($this->user(User::ROLE_STAFF))->getJson('/api/settings/system')
            ->assertOk()
            ->assertJsonMissingPath('backupDue')
            ->assertJsonMissingPath('lastBackupAt');
    }

    /* ---------- Require the authenticator app ---------- */

    public function test_when_required_an_account_without_authenticator_must_connect_one_to_sign_in(): void
    {
        AppSetting::put('require_authenticator', '1');
        $user = $this->user(User::ROLE_STAFF, ['password' => 'Strong123']);

        $response = $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'Strong123'])
            ->assertOk()
            ->assertJsonPath('twoFactorSetupRequired', true)
            ->assertJsonMissingPath('user');
        $this->assertGuest();

        $secret = str_replace(' ', '', (string) $response->json('twoFactor.secret'));
        $this->assertStringStartsWith('otpauth://totp/', (string) $response->json('twoFactor.uri'));
        $code = \App\Support\Totp::codeAt($secret, intdiv(time(), 30));
        $wrong = $code === '000000' ? '111111' : '000000';

        $this->postJson('/auth/two-factor/setup', ['code' => $wrong])->assertUnprocessable()->assertJsonValidationErrors('code');
        $this->assertGuest();

        $this->postJson('/auth/two-factor/setup', ['code' => $code])
            ->assertOk()
            ->assertJsonPath('user.email', $user->email);
        $this->assertAuthenticatedAs($user);
        $this->assertTrue($user->fresh()->hasTwoFactor());
    }

    public function test_setup_step_cannot_be_used_without_the_password_step(): void
    {
        AppSetting::put('require_authenticator', '1');
        $this->postJson('/auth/two-factor/setup', ['code' => '123456'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'two_factor_expired');
        $this->assertGuest();
    }

    public function test_when_not_required_accounts_without_authenticator_sign_in_as_before(): void
    {
        $user = $this->user(User::ROLE_STAFF, ['password' => 'Strong123']);
        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'Strong123'])
            ->assertOk()
            ->assertJsonPath('user.email', $user->email)
            ->assertJsonMissingPath('twoFactorSetupRequired');
        $this->assertAuthenticatedAs($user);
    }

    public function test_when_required_accounts_that_already_have_it_just_type_their_code(): void
    {
        AppSetting::put('require_authenticator', '1');
        $user = $this->user(User::ROLE_STAFF, ['password' => 'Strong123']);
        $user->forceFill(['two_factor_secret' => \App\Support\Totp::newSecret(), 'two_factor_confirmed_at' => now()])->save();

        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'Strong123'])
            ->assertOk()
            ->assertJsonPath('twoFactorRequired', true)
            ->assertJsonMissingPath('twoFactorSetupRequired');
    }

    public function test_super_admin_turns_the_requirement_on_and_sees_who_is_missing_it(): void
    {
        $owner = $this->user(User::ROLE_SUPER_ADMIN);
        $this->user(User::ROLE_STAFF);

        $this->actingAs($owner)->putJson('/api/settings/system', ['requireAuthenticator' => true])
            ->assertOk()
            ->assertJsonPath('requireAuthenticator', true)
            ->assertJsonPath('accountsWithoutAuthenticator', 2);
        $this->assertTrue(AppSetting::requireAuthenticator());
        $this->assertDatabaseHas('activity_logs', ['action' => 'settings.require_2fa']);
    }
}
