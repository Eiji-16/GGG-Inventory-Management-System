<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * php artisan inventory:create-admin
 *
 * Creates a Super Admin account. Use it once on a new server (the database
 * starts with no accounts), or if every Super Admin is locked out. It only
 * adds an account — nothing existing is changed. The password is typed in
 * hidden and saved hashed; it is never shown or written to the log.
 */
class CreateSuperAdmin extends Command
{
    protected $signature = 'inventory:create-admin {--name= : Full name} {--email= : Email used to sign in}';

    protected $description = 'Create a Super Admin account (for a new server)';

    public function handle(): int
    {
        $activeSupers = User::where('role', User::ROLE_SUPER_ADMIN)->where('status', User::STATUS_ACTIVE)->count();
        if ($activeSupers > 0 && ! $this->confirm("There is already {$activeSupers} active Super Admin account(s). Create another one?", false)) {
            $this->info('Nothing was changed.');

            return self::SUCCESS;
        }

        $name = trim((string) ($this->option('name') ?: $this->ask('Full name')));
        $email = strtolower(trim((string) ($this->option('email') ?: $this->ask('Email (used to sign in)'))));
        $password = (string) $this->secret('Password (at least 8 characters)');
        $confirm = (string) $this->secret('Type the password again');

        $validator = Validator::make(
            ['name' => $name, 'email' => $email, 'password' => $password, 'password_confirmation' => $confirm],
            [
                'name' => ['required', 'string', 'max:255'],
                'email' => ['required', 'email', 'max:255', 'unique:users,email'],
                'password' => ['required', 'confirmed', Password::min(8)],
            ],
        );
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }
            $this->info('Nothing was changed. Run the command again.');

            return self::FAILURE;
        }

        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => $password,   // hashed by the User model
            'role' => User::ROLE_SUPER_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);
        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'staff.create',
            'description' => "Created account — {$user->name} (super_admin) from the server command line",
            'icon' => 'user',
            'meta' => ['email' => $user->email],
        ]);

        $this->info("Super Admin created: {$user->name} <{$user->email}>. You can sign in now.");

        return self::SUCCESS;
    }
}
